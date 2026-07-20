import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import {
  AUDIT_VIEW_CONTRACT_ABI,
  ELECTION_FACTORY_GET_ELECTION_ABI,
} from './constants/audit-view-contract.abi';
import { BALLOT_CONTRACT_ABI } from './constants/ballot-contract.abi';
import { MERKLE_ROOT_STORE_ABI } from './constants/merkle-root-store.abi';
import { PublishMerkleRootResult } from './interfaces/publish-merkle-root-result.interface';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

export type VoteParticipationOnChain = {
  txHash: string;
  idEleccion: number;
  blockNumber: number;
  timestamp: Date;
  contractAddress: string;
};

export type ParticipationStatsOnChain = {
  totalVotes: number;
  blankVotes: number;
  nullVotes: number;
};

export type EscrutinioTalliesOnChain = {
  participation: ParticipationStatsOnChain;
  votesByCandidateId: Record<number, number>;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface AuditViewContract {
  getParticipationStats(electionId: number): Promise<[bigint, bigint, bigint]>;
  getVotesByCandidate(
    electionId: number,
    candidateId: bigint | number,
  ): Promise<bigint>;
}

interface ElectionFactoryContract {
  getElection(electionId: number): Promise<{
    ballot: string;
    voteRegistry: string;
    auditView: string;
    exists: boolean;
  }>;
}

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
   * VOTAR-366: human-readable chain label for inclusion confirmation messages.
   */
  getNetworkDisplayName(): string {
    const configured = this.configService.get<string>(
      'BLOCKCHAIN_NETWORK_NAME',
    );
    if (configured?.trim()) {
      return configured.trim();
    }
    const explorerBase =
      this.configService.get<string>('ETHERSCAN_BASE_URL') ??
      'https://sepolia.etherscan.io';
    if (explorerBase.includes('sepolia')) {
      return 'Sepolia';
    }
    return 'Ethereum';
  }

  /**
   * VOTAR-360/366: confirm SignedVoteCast inclusion by txHash without exposing vote choice.
   * selectionHash / nullifier are parsed only to prove the event exists and are never
   * returned to callers. SignedVoteCast omits voterLeaf (VOTAR-346) so padron identity
   * cannot be joined to VoteCast preferences on-chain.
   */
  async getVoteParticipationByTxHash(
    txHash: string,
  ): Promise<VoteParticipationOnChain> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const ballotAddress = this.configService.get<string>(
      'BALLOT_CONTRACT_ADDRESS',
    );

    if (!rpcUrl || !ballotAddress) {
      throw new ServiceUnavailableException(
        'La verificación on-chain no está configurada (SEPOLIA_RPC_URL, BALLOT_CONTRACT_ADDRESS).',
      );
    }

    const provider = new JsonRpcProvider(rpcUrl);
    let receipt: Awaited<ReturnType<JsonRpcProvider['getTransactionReceipt']>>;
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo consultar la transacción on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new NotFoundException(
        'El registro de sufragio no pudo ser encontrado en el sistema. Verifique el identificador ingresado.',
      );
    }

    if (receipt.status !== 1) {
      throw new NotFoundException(
        'El registro de sufragio no pudo ser encontrado en el sistema. Verifique el identificador ingresado.',
      );
    }

    const toAddress = receipt.to?.toLowerCase();
    if (!toAddress || toAddress !== ballotAddress.toLowerCase()) {
      throw new NotFoundException(
        'El registro de sufragio no pudo ser encontrado en el sistema. Verifique el identificador ingresado.',
      );
    }

    const iface = new Interface(BALLOT_CONTRACT_ABI);
    const voteEvent = receipt.logs
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
      .find((parsed) => parsed?.name === 'SignedVoteCast');

    if (!voteEvent) {
      throw new NotFoundException(
        'El registro de sufragio no pudo ser encontrado en el sistema. Verifique el identificador ingresado.',
      );
    }

    const idEleccion = Number(voteEvent.args[0]);
    if (!Number.isFinite(idEleccion) || idEleccion <= 0) {
      throw new NotFoundException(
        'El evento SignedVoteCast no incluye un id de elección válido.',
      );
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const timestamp = block?.timestamp
      ? new Date(Number(block.timestamp) * 1000)
      : new Date();

    return {
      txHash: receipt.hash.toLowerCase(),
      idEleccion,
      blockNumber: receipt.blockNumber,
      timestamp,
      contractAddress: ballotAddress,
    };
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
   * VOTAR-364: resolves AuditView address for an election.
   * Prefer ElectionFactory.getElection(...).auditView; fallback AUDIT_VIEW_ADDRESS.
   */
  async resolveAuditViewAddress(electionId: number): Promise<string> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'La lectura de resultados on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }
    const factoryAddress = this.configService.get<string>(
      'ELECTION_FACTORY_ADDRESS',
    );
    if (factoryAddress) {
      try {
        const provider = new JsonRpcProvider(rpcUrl);
        const factory = new Contract(
          factoryAddress,
          ELECTION_FACTORY_GET_ELECTION_ABI,
          provider,
        ) as unknown as ElectionFactoryContract;
        const deployment = await factory.getElection(electionId);
        if (
          deployment.exists &&
          deployment.auditView &&
          deployment.auditView.toLowerCase() !== ZERO_ADDRESS
        ) {
          return deployment.auditView;
        }
      } catch {
        // Fall through to AUDIT_VIEW_ADDRESS fallback.
      }
    }
    const fallback = this.configService.get<string>('AUDIT_VIEW_ADDRESS');
    if (fallback && fallback.toLowerCase() !== ZERO_ADDRESS) {
      return fallback;
    }
    throw new ServiceUnavailableException(
      'No hay contrato AuditView disponible para este comicio (ElectionFactory sin deployment ni AUDIT_VIEW_ADDRESS).',
    );
  }

  /**
   * VOTAR-364: reads participation aggregates from AuditViewContract.
   */
  async fetchParticipationStats(
    auditViewAddress: string,
    electionId: number,
  ): Promise<ParticipationStatsOnChain> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'La lectura de resultados on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(
      auditViewAddress,
      AUDIT_VIEW_CONTRACT_ABI,
      provider,
    ) as unknown as AuditViewContract;
    try {
      const [totalVotes, blankVotes, nullVotes] =
        await contract.getParticipationStats(electionId);
      return {
        totalVotes: Number(totalVotes),
        blankVotes: Number(blankVotes),
        nullVotes: Number(nullVotes),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudieron leer estadísticas de participación on-chain: ${message}`,
      );
    }
  }

  /**
   * VOTAR-364: reads running tally for a candidate (or reserved blanco/nulo id).
   */
  async fetchVotesByCandidate(
    auditViewAddress: string,
    electionId: number,
    candidateId: number | bigint,
  ): Promise<number> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'La lectura de resultados on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(
      auditViewAddress,
      AUDIT_VIEW_CONTRACT_ABI,
      provider,
    ) as unknown as AuditViewContract;
    try {
      const votes = await contract.getVotesByCandidate(
        electionId,
        typeof candidateId === 'bigint' ? candidateId : BigInt(candidateId),
      );
      return Number(votes);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo leer el tally on-chain del candidato: ${message}`,
      );
    }
  }

  /**
   * VOTAR-364: fetches participation + per-candidate tallies in one resolution pass.
   */
  async fetchEscrutinioTallies(
    electionId: number,
    candidateIds: number[],
  ): Promise<EscrutinioTalliesOnChain> {
    const auditViewAddress = await this.resolveAuditViewAddress(electionId);
    const participation = await this.fetchParticipationStats(
      auditViewAddress,
      electionId,
    );
    const votesByCandidateId: Record<number, number> = {};
    await Promise.all(
      candidateIds.map(async (candidateId) => {
        votesByCandidateId[candidateId] = await this.fetchVotesByCandidate(
          auditViewAddress,
          electionId,
          candidateId,
        );
      }),
    );
    return {
      participation,
      votesByCandidateId,
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
    if (
      !Number.isFinite(startUnix) ||
      !Number.isFinite(endUnix) ||
      endUnix <= startUnix
    ) {
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
      const tx = await contract.setElectionWindow(
        electionId,
        startUnix,
        endUnix,
      );
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
