import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  ContractTransactionReceipt,
  ContractTransactionResponse,
  Interface,
  JsonRpcProvider,
  Log,
  Wallet,
} from 'ethers';
import { MERKLE_ROOT_STORE_ABI } from './constants/merkle-root-store.abi';
import { PublishMerkleRootResult } from './interfaces/publish-merkle-root-result.interface';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

/**
 * Maps backend EleccionEstado to smart contract ElectionState enum.
 * @dev VOTAR-336: Hermetic seal — sync election state to blockchain.
 */
const ESTADO_TO_BLOCKCHAIN_STATE: Record<EleccionEstado, number> = {
  [EleccionEstado.BORRADOR]: 0, // DRAFT
  [EleccionEstado.CONFIGURADA]: 1, // CONFIGURED
  [EleccionEstado.ABIERTA]: 2, // OPEN
  [EleccionEstado.CERRADA]: 3, // CLOSED
  [EleccionEstado.ESCRUTADA]: 4, // TALLIED
};

interface MerkleRootStoreContract {
  publishRoot(
    electionId: number,
    root: string,
  ): Promise<ContractTransactionResponse>;
  getMerkleRoot(
    electionId: number,
  ): Promise<[string, bigint] & { root: string; timestamp: bigint }>;
  isPublished(electionId: number): Promise<boolean>;
}

@Injectable()
export class BlockchainService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Publishes the Merkle root for an election on Sepolia via MerkleRootStore.
   */
  async publishMerkleRoot(
    electionId: number,
    merkleRoot: string,
  ): Promise<PublishMerkleRootResult> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );
    const privateKey = this.configService.get<string>(
      'MERKLE_UPDATER_PRIVATE_KEY',
    );

    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new ServiceUnavailableException(
        'La publicación on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS, MERKLE_UPDATER_PRIVATE_KEY).',
      );
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);
    const contract = new Contract(
      contractAddress,
      MERKLE_ROOT_STORE_ABI,
      wallet,
    ) as unknown as MerkleRootStoreContract;

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract.publishRoot(electionId, merkleRoot);
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      if (
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee MERKLE_UPDATER_ROLE en el contrato.',
        );
      }
      if (message.includes('RootAlreadyPublished')) {
        throw new ServiceUnavailableException(
          'La raíz Merkle ya fue publicada on-chain para este comicio.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo publicar la raíz Merkle on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        'La transacción on-chain no devolvió recibo de confirmación.',
      );
    }

    const iface = new Interface(MERKLE_ROOT_STORE_ABI);
    const parsedEvent = receipt.logs
      .map((log: Log) => {
        try {
          return iface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === 'RootPublished');

    if (!parsedEvent) {
      throw new ServiceUnavailableException(
        'La transacción se confirmó pero no se emitió el evento RootPublished.',
      );
    }

    const eventElectionId = Number(parsedEvent.args[0]);
    const eventRoot = String(parsedEvent.args[1]);
    if (eventElectionId !== electionId || eventRoot !== merkleRoot) {
      throw new ServiceUnavailableException(
        'El evento RootPublished no coincide con los parámetros enviados.',
      );
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const publishedAt = block?.timestamp
      ? new Date(block.timestamp * 1000)
      : new Date();

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      contractAddress,
      publishedAt,
      electionId,
      merkleRoot,
    };
  }

  /**
   * Verifies that the Merkle root for an election is published on-chain.
   * Returns true if the root matches and is non-zero, false otherwise.
   */
  async verifyMerkleRootOnChain(
    electionId: number,
    expectedRoot: string,
  ): Promise<boolean> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );

    if (!rpcUrl || !contractAddress) {
      throw new ServiceUnavailableException(
        'La verificación on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS).',
      );
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(
      contractAddress,
      MERKLE_ROOT_STORE_ABI,
      provider,
    ) as unknown as MerkleRootStoreContract;

    try {
      const [root] = await contract.getMerkleRoot(electionId);

      // Verificar que no sea el hash vacío (0x0000...)
      const zeroHash =
        '0x0000000000000000000000000000000000000000000000000000000000000000';

      return root === expectedRoot && root !== zeroHash;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo verificar la raíz Merkle on-chain: ${message}`,
      );
    }
  }

  buildExplorerUrl(txHash: string): string {
    const base =
      this.configService.get<string>('ETHERSCAN_BASE_URL') ??
      'https://sepolia.etherscan.io';
    return `${base}/tx/${txHash}`;
  }

  /**
   * Synchronizes the election state to the blockchain.
   * @dev VOTAR-336: Hermetic seal — enables on-chain state validation.
   * This should be called when transitioning to ABIERTA to activate the RootLocked protection.
   */
  async syncElectionState(
    electionId: number,
    estado: EleccionEstado,
  ): Promise<{ txHash: string; blockNumber: number }> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );
    const privateKey = this.configService.get<string>(
      'ELECTION_ADMIN_PRIVATE_KEY',
    );

    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new ServiceUnavailableException(
        'La sincronización de estado on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS, ELECTION_ADMIN_PRIVATE_KEY).',
      );
    }

    const blockchainState = ESTADO_TO_BLOCKCHAIN_STATE[estado];
    if (blockchainState === undefined) {
      throw new ServiceUnavailableException(
        `Estado de elección inválido: ${estado}`,
      );
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);
    const contract = new Contract(
      contractAddress,
      MERKLE_ROOT_STORE_ABI,
      wallet,
    ) as unknown as MerkleRootStoreContract & {
      setElectionState(
        electionId: number,
        state: number,
      ): Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract.setElectionState(electionId, blockchainState);
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      if (
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee ELECTION_ADMIN_ROLE en el contrato.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo sincronizar el estado on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        'La transacción de sincronización no devolvió recibo de confirmación.',
      );
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Publishes the voting window on-chain so BallotContract can close autonomously
   * when `block.timestamp >= endTime` (VOTAR-321).
   */
  async syncElectionWindow(
    electionId: number,
    startTime: Date,
    endTime: Date,
  ): Promise<{ txHash: string; blockNumber: number }> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );
    const privateKey = this.configService.get<string>(
      'ELECTION_ADMIN_PRIVATE_KEY',
    );

    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new ServiceUnavailableException(
        'La sincronización de ventana on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS, ELECTION_ADMIN_PRIVATE_KEY).',
      );
    }

    const startUnix = Math.floor(startTime.getTime() / 1000);
    const endUnix = Math.floor(endTime.getTime() / 1000);
    if (!Number.isFinite(startUnix) || !Number.isFinite(endUnix) || endUnix <= startUnix) {
      throw new ServiceUnavailableException(
        'La ventana electoral on-chain es inválida (endTime debe ser posterior a startTime).',
      );
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);
    const contract = new Contract(
      contractAddress,
      MERKLE_ROOT_STORE_ABI,
      wallet,
    ) as unknown as {
      setElectionWindow(
        electionId: number,
        startTime: number,
        endTime: number,
      ): Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract.setElectionWindow(electionId, startUnix, endUnix);
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      if (
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee ELECTION_ADMIN_ROLE en el contrato.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo sincronizar la ventana electoral on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        'La transacción de ventana electoral no devolvió recibo de confirmación.',
      );
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }
}
