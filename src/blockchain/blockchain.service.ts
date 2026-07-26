import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
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
  ZeroAddress,
} from 'ethers';
import {
  AUDIT_VIEW_CONTRACT_ABI,
  ELECTION_FACTORY_GET_ELECTION_ABI,
} from './constants/audit-view-contract.abi';
import { BALLOT_CONTRACT_ABI } from './constants/ballot-contract.abi';
import { ELECTION_FACTORY_CONTRACT_ABI } from './constants/election-factory-contract.abi';
import { MERKLE_ROOT_STORE_ABI } from './constants/merkle-root-store.abi';
import { VOTE_REGISTRY_CONTRACT_ABI } from './constants/vote-registry-contract.abi';
import { PublishMerkleRootResult } from './interfaces/publish-merkle-root-result.interface';
import { ContratoBlockchainService } from './services/contrato-blockchain.service';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import type { RevoteConfigOnChain } from '@/eleccion/configuracion-comicio/mappers/revote-config.mapper';

export type VoteParticipationOnChain = {
  txHash: string;
  idEleccion: number;
  blockNumber: number;
  timestamp: Date;
  contractAddress: string;
};

export type ElectionContractAddresses = {
  ballot: string;
  voteRegistry: string;
  auditView: string;
};

export type DeployElectionStackResult = ElectionContractAddresses & {
  txHash: string;
  blockNumber: number;
  alreadyDeployed: boolean;
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

export type VoteCastTimelinePoint = {
  etiqueta: string;
  acumulado: number;
  nuevos: number;
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
  constructor(
    private readonly configService: ConfigService,
    private readonly contratoBlockchainService: ContratoBlockchainService,
  ) {}

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
   * VOTAR-323: deploys per-election stack via ElectionFactory.createElection,
   * sealing RevoteConfig.enabled for the comicio lifecycle.
   */
  async deployElectionStack(
    idEleccion: number,
    revoteConfig: RevoteConfigOnChain,
  ): Promise<DeployElectionStackResult> {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const privateKey = this.configService.get<string>(
      'ELECTION_ADMIN_PRIVATE_KEY',
    );

    if (!rpcUrl || !privateKey) {
      throw new ServiceUnavailableException(
        'El despliegue on-chain no está configurado (SEPOLIA_RPC_URL, ELECTION_ADMIN_PRIVATE_KEY).',
      );
    }

    let factoryAddress: string;
    try {
      const factoryPayload =
        await this.contratoBlockchainService.getElectionFactory();
      factoryAddress = factoryPayload.direccionContrato;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ServiceUnavailableException(
          'ElectionFactory no registrada en PostgreSQL. Ejecutá sync:election-factory tras el deploy.',
        );
      }
      throw error;
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const readFactory = new Contract(
      factoryAddress,
      ELECTION_FACTORY_CONTRACT_ABI,
      provider,
    ) as unknown as ElectionFactoryContract;

    let existing: Awaited<ReturnType<ElectionFactoryContract['getElection']>>;
    try {
      existing = await readFactory.getElection(idEleccion);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo consultar el deployment del comicio on-chain: ${message}`,
      );
    }

    if (
      existing.exists &&
      existing.ballot &&
      existing.ballot !== ZeroAddress &&
      existing.voteRegistry &&
      existing.voteRegistry !== ZeroAddress
    ) {
      return {
        ballot: existing.ballot,
        voteRegistry: existing.voteRegistry,
        auditView: existing.auditView,
        txHash: '',
        blockNumber: 0,
        alreadyDeployed: true,
      };
    }

    const wallet = new Wallet(privateKey, provider);
    const writeFactory = new Contract(
      factoryAddress,
      ELECTION_FACTORY_CONTRACT_ABI,
      wallet,
    ) as unknown as {
      createElection: (
        electionId: number,
        config: RevoteConfigOnChain,
      ) => Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await writeFactory.createElection(idEleccion, revoteConfig);
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
          'La cuenta configurada no posee DEFAULT_ADMIN_ROLE en ElectionFactory.',
        );
      }
      if (message.includes('ElectionAlreadyExists')) {
        const redeployed = await readFactory.getElection(idEleccion);
        return {
          ballot: redeployed.ballot,
          voteRegistry: redeployed.voteRegistry,
          auditView: redeployed.auditView,
          txHash: '',
          blockNumber: 0,
          alreadyDeployed: true,
        };
      }
      throw new ServiceUnavailableException(
        `No se pudo desplegar el stack electoral on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        'La transacción createElection no devolvió recibo de confirmación.',
      );
    }

    const deployed = await readFactory.getElection(idEleccion);
    if (!deployed.exists) {
      throw new ServiceUnavailableException(
        'createElection se confirmó pero getElection indica que el comicio no existe.',
      );
    }

    return {
      ballot: deployed.ballot,
      voteRegistry: deployed.voteRegistry,
      auditView: deployed.auditView,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      alreadyDeployed: false,
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

  /**
   * VOTAR-365: resolves AuditView + VoteRegistry addresses for an election.
   * Prefers ElectionFactory.getElection; falls back to env vars for local/dev.
   */
  async resolveElectionContracts(
    idEleccion: number,
  ): Promise<ElectionContractAddresses> {
    const fromEnv = this.resolveContractsFromEnv();
    if (fromEnv) {
      return fromEnv;
    }

    const rpcUrl = this.requireRpcUrl();
    let factory: { direccionContrato: string };
    try {
      factory = await this.contratoBlockchainService.getElectionFactory();
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ServiceUnavailableException(
          'ElectionFactory no registrada y no hay AUDIT_VIEW_CONTRACT_ADDRESS / VOTE_REGISTRY_CONTRACT_ADDRESS configuradas.',
        );
      }
      throw error;
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(
      factory.direccionContrato,
      ELECTION_FACTORY_CONTRACT_ABI,
      provider,
    ) as unknown as {
      getElection: (electionId: number) => Promise<{
        ballot: string;
        voteRegistry: string;
        auditView: string;
        exists: boolean;
      }>;
    };

    let deployment: {
      ballot: string;
      voteRegistry: string;
      auditView: string;
      exists: boolean;
    };
    try {
      deployment = await contract.getElection(idEleccion);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo resolver los contratos del comicio on-chain: ${message}`,
      );
    }

    if (
      !deployment.exists ||
      !deployment.auditView ||
      deployment.auditView === ZeroAddress ||
      !deployment.voteRegistry ||
      deployment.voteRegistry === ZeroAddress
    ) {
      throw new UnprocessableEntityException(
        `El comicio ${idEleccion} no tiene contratos electorales desplegados on-chain.`,
      );
    }

    return {
      ballot: deployment.ballot,
      voteRegistry: deployment.voteRegistry,
      auditView: deployment.auditView,
    };
  }

  /**
   * VOTAR-365 / VOTAR-350: aggregate participation via AuditViewContract.
   */
  async getParticipationStats(
    idEleccion: number,
  ): Promise<ParticipationStatsOnChain> {
    const addresses = await this.resolveElectionContracts(idEleccion);
    const provider = new JsonRpcProvider(this.requireRpcUrl());
    const auditView = new Contract(
      addresses.auditView,
      AUDIT_VIEW_CONTRACT_ABI,
      provider,
    ) as unknown as {
      getParticipationStats: (
        electionId: number,
      ) => Promise<[bigint, bigint, bigint]>;
    };

    try {
      const [totalVotes, blankVotes, nullVotes] =
        await auditView.getParticipationStats(idEleccion);
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
        `No se pudieron obtener las estadísticas de participación on-chain: ${message}`,
      );
    }
  }

  /**
   * VOTAR-365 / VOTAR-350: running tally for a candidate id (0 if unknown).
   */
  async getVotesByCandidate(
    idEleccion: number,
    candidateId: number,
  ): Promise<number> {
    const addresses = await this.resolveElectionContracts(idEleccion);
    const provider = new JsonRpcProvider(this.requireRpcUrl());
    const auditView = new Contract(
      addresses.auditView,
      AUDIT_VIEW_CONTRACT_ABI,
      provider,
    ) as unknown as {
      getVotesByCandidate: (
        electionId: number,
        candidateId: number,
      ) => Promise<bigint>;
    };

    try {
      const votes = await auditView.getVotesByCandidate(
        idEleccion,
        candidateId,
      );
      return Number(votes);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo obtener el tally on-chain del candidato ${candidateId}: ${message}`,
      );
    }
  }

  /**
   * VOTAR-365: builds an hourly cumulative series from VoteCast events.
   * Only the first vote per voterHash increments the accumulator (revotes ignored).
   */
  async getVoteCastTimeline(
    idEleccion: number,
    horasVentana = 12,
  ): Promise<VoteCastTimelinePoint[]> {
    const hours = Math.max(1, Math.min(72, Math.floor(horasVentana)));
    const addresses = await this.resolveElectionContracts(idEleccion);
    const provider = new JsonRpcProvider(this.requireRpcUrl());
    const registry = new Contract(
      addresses.voteRegistry,
      VOTE_REGISTRY_CONTRACT_ABI,
      provider,
    ) as unknown as {
      filters: {
        VoteCast: (electionId: number) => unknown;
      };
      queryFilter: (filter: unknown) => Promise<
        Array<{
          args: {
            voterHash: string;
            isOverwrite: boolean;
          };
          blockNumber: number;
        }>
      >;
    };

    let events: Array<{
      args: { voterHash: string; isOverwrite: boolean };
      blockNumber: number;
    }>;
    try {
      const filter = registry.filters.VoteCast(idEleccion);
      events = await registry.queryFilter(filter);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo consultar la curva temporal de VoteCast: ${message}`,
      );
    }

    const firstVotes: Array<{ voterHash: string; timestampMs: number }> = [];
    const seenVoters = new Set<string>();
    const blockTimestampCache = new Map<number, number>();

    const sortedEvents = [...events].sort(
      (a, b) => a.blockNumber - b.blockNumber,
    );

    for (const event of sortedEvents) {
      const voterHash = String(event.args.voterHash).toLowerCase();
      if (seenVoters.has(voterHash)) {
        continue;
      }
      if (event.args.isOverwrite === true) {
        continue;
      }
      seenVoters.add(voterHash);

      let timestampMs = blockTimestampCache.get(event.blockNumber);
      if (timestampMs === undefined) {
        const block = await provider.getBlock(event.blockNumber);
        timestampMs = block?.timestamp
          ? Number(block.timestamp) * 1000
          : Date.now();
        blockTimestampCache.set(event.blockNumber, timestampMs);
      }
      firstVotes.push({ voterHash, timestampMs });
    }

    const nowMs = Date.now();
    const windowStartMs = nowMs - hours * 60 * 60 * 1000;
    const bucketCount = hours;
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const startMs = windowStartMs + index * 60 * 60 * 1000;
      const endMs = startMs + 60 * 60 * 1000;
      return { startMs, endMs, nuevos: 0 };
    });

    const votesBeforeWindow = firstVotes.filter(
      (vote) => vote.timestampMs < windowStartMs,
    ).length;

    for (const vote of firstVotes) {
      if (vote.timestampMs < windowStartMs || vote.timestampMs > nowMs) {
        continue;
      }
      const bucketIndex = Math.min(
        bucketCount - 1,
        Math.floor((vote.timestampMs - windowStartMs) / (60 * 60 * 1000)),
      );
      buckets[bucketIndex].nuevos += 1;
    }

    let acumulado = votesBeforeWindow;
    return buckets.map((bucket) => {
      acumulado += bucket.nuevos;
      const date = new Date(bucket.startMs);
      const etiqueta = date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Argentina/Buenos_Aires',
      });
      return {
        etiqueta,
        acumulado,
        nuevos: bucket.nuevos,
      };
    });
  }

  private requireRpcUrl(): string {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'La consulta on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }
    return rpcUrl;
  }

  private resolveContractsFromEnv(): ElectionContractAddresses | null {
    const auditView = this.configService.get<string>(
      'AUDIT_VIEW_CONTRACT_ADDRESS',
    );
    const voteRegistry = this.configService.get<string>(
      'VOTE_REGISTRY_CONTRACT_ADDRESS',
    );
    const ballot =
      this.configService.get<string>('BALLOT_CONTRACT_ADDRESS') ?? ZeroAddress;
    if (
      auditView?.trim() &&
      voteRegistry?.trim() &&
      auditView !== ZeroAddress &&
      voteRegistry !== ZeroAddress
    ) {
      return {
        auditView: auditView.trim(),
        voteRegistry: voteRegistry.trim(),
        ballot: ballot.trim(),
      };
    }
    return null;
  }
}
