import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
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
  type InterfaceAbi,
  Log,
  type Provider,
  type TransactionReceipt,
  Wallet,
  ZeroAddress,
} from 'ethers';
import { RpcProviderFactory } from './rpc/rpc-provider.factory';
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
import {
  describeVoteCastAudit,
  describeVoteUpdatedAudit,
  joinAuditDescriptions,
} from './utils/audit-transaction-description.util';
import type { BlockchainTransactionAuditEntry } from './blockchain-transaction.types';
import { TransaccionBlockchainService } from './services/transaccion-blockchain.service';
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

export type RevoteStatsOnChain = {
  totalRevotes: number;
  uniqueVoters: number;
  overwriteRatio: number;
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

export type ContratoDireccionOnChain = {
  direccion: string;
  explorerUrl: string;
};

export type ContratoEstadoOnChain = {
  estadoOnChain: {
    codigo: number;
    etiqueta: string;
  };
  merkleRoot: {
    hash: string;
    publicado: boolean;
    publicadoEn: string | null;
    consistente: boolean;
  };
  revoto: {
    habilitado: boolean;
    maxVotosPorVotante: number;
    minIntervaloSegundos: number;
    politicaRevoto: 'LAST_VOTE_WINS' | 'DISABLED';
  };
  contratos: {
    ballot: ContratoDireccionOnChain;
    voteRegistry: ContratoDireccionOnChain;
    auditView: ContratoDireccionOnChain;
    merkleRootStore: ContratoDireccionOnChain;
  };
  red: string;
  chainId: number;
};

export type { BlockchainTransactionAuditEntry } from './blockchain-transaction.types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const ZERO_MERKLE_ROOT =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * True when an eth_call failed because the selector is absent on the deployed
 * bytecode (typical for non-upgradeable contracts predating a new view).
 */
const isMissingOnChainSelectorError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  return (
    code === 'CALL_EXCEPTION' ||
    message.includes('CALL_EXCEPTION') ||
    message.includes('missing revert data') ||
    /function selector was not recognized|no matching fragment|unknown function/i.test(
      message,
    )
  );
};

const BLOCKCHAIN_STATE_LABELS: Record<number, string> = {
  0: 'BORRADOR',
  1: 'CONFIGURADA',
  2: 'ABIERTA',
  3: 'CERRADA',
  4: 'ESCRUTADA',
};

const BALLOT_REVOTE_READ_ABI = [
  'function maxVotesPerVoter() view returns (uint16)',
  'function minIntervalSeconds() view returns (uint32)',
] as const;

const VOTE_REGISTRY_REVOTE_READ_ABI = [
  'function revoteEnabled() view returns (bool)',
] as const;

interface AuditViewContract {
  getParticipationStats(electionId: number): Promise<[bigint, bigint, bigint]>;
  getRevoteStats(electionId: number): Promise<[bigint, bigint, bigint]>;
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
  // VOTAR-322: archivado es puramente off-chain; este valor nunca se envía
  // a syncElectionState (el contrato queda inmutable en CLOSED).
  [EleccionEstado.ARCHIVADA]: 3, // CLOSED
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
  private readonly logger = new Logger(BlockchainService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly contratoBlockchainService: ContratoBlockchainService,
    @Inject(forwardRef(() => TransaccionBlockchainService))
    private readonly transaccionBlockchainService: TransaccionBlockchainService,
    private readonly rpcProviderFactory: RpcProviderFactory,
  ) {}

  /**
   * Publishes the Merkle root for an election on Sepolia via MerkleRootStore.
   */
  async publishMerkleRoot(
    electionId: number,
    merkleRoot: string,
  ): Promise<PublishMerkleRootResult> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );

    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new ServiceUnavailableException(
        'La publicación on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS, PRIVATE_KEY).',
      );
    }

    const provider = this.createProvider();
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
      const decodedName = this.decodeContractErrorName(
        error,
        MERKLE_ROOT_STORE_ABI,
      );
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee MERKLE_UPDATER_ROLE en el contrato.',
        );
      }
      if (
        decodedName === 'RootAlreadyPublished' ||
        message.includes('RootAlreadyPublished')
      ) {
        throw new ServiceUnavailableException(
          'La raíz Merkle ya fue publicada on-chain para este comicio.',
        );
      }
      if (decodedName === 'RootLocked' || message.includes('RootLocked')) {
        throw new ServiceUnavailableException(
          'No se puede publicar el padrón porque el comicio ya está abierto, cerrado o escrutado (sello hermético).',
        );
      }
      if (decodedName === 'RootIsZero' || message.includes('RootIsZero')) {
        throw new ServiceUnavailableException(
          'La raíz Merkle calculada es inválida (vacía).',
        );
      }
      if (
        decodedName === 'InvalidElectionWindow' ||
        message.includes('InvalidElectionWindow')
      ) {
        throw new ServiceUnavailableException(
          'La ventana de votación configurada para el comicio es inválida.',
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

    this.indexTxSilently(electionId, receipt.hash);

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
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );

    if (!rpcUrl || !contractAddress) {
      throw new ServiceUnavailableException(
        'La verificación on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS).',
      );
    }

    const provider = this.createProvider();
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
    return `${this.explorerBaseUrl()}/tx/${txHash}`;
  }

  buildExplorerAddressUrl(contractAddress: string): string {
    return `${this.explorerBaseUrl()}/address/${contractAddress}`;
  }

  getChainId(): number {
    const configured = this.configService.get<number>('CHAIN_ID');
    if (
      typeof configured === 'number' &&
      Number.isFinite(configured) &&
      configured > 0
    ) {
      return configured;
    }
    return 11155111;
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
    const provider = this.createProvider();
    let receipt: TransactionReceipt | null;
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

    // VOTAR-439: cada comicio tiene su propio BallotContract desplegado vía
    // ElectionFactory (ver resolveElectionContracts), por lo que el idEleccion
    // se decodifica del evento ANTES de validar la dirección del contrato —
    // comparar contra un único BALLOT_CONTRACT_ADDRESS fijo rechazaba con 404
    // cualquier voto de un comicio distinto al que ese valor apuntaba.
    const iface = new Interface(BALLOT_CONTRACT_ABI);
    const voteEvent = receipt.logs
      .map((log: Log) => {
        try {
          return {
            log,
            parsed: iface.parseLog({
              topics: [...log.topics],
              data: log.data,
            }),
          };
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.parsed?.name === 'SignedVoteCast');

    if (!voteEvent?.parsed) {
      throw new NotFoundException(
        'El registro de sufragio no pudo ser encontrado en el sistema. Verifique el identificador ingresado.',
      );
    }

    const idEleccion = Number(voteEvent.parsed.args[0]);
    if (!Number.isFinite(idEleccion) || idEleccion <= 0) {
      throw new NotFoundException(
        'El evento SignedVoteCast no incluye un id de elección válido.',
      );
    }

    const { ballot: ballotAddress } =
      await this.resolveElectionContracts(idEleccion);

    const eventAddress = voteEvent.log.address?.toLowerCase();
    if (!eventAddress || eventAddress !== ballotAddress.toLowerCase()) {
      throw new NotFoundException(
        'El registro de sufragio no pudo ser encontrado en el sistema. Verifique el identificador ingresado.',
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
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );

    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new ServiceUnavailableException(
        'La sincronización de estado on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS, PRIVATE_KEY).',
      );
    }

    const blockchainState = ESTADO_TO_BLOCKCHAIN_STATE[estado];
    if (blockchainState === undefined) {
      throw new ServiceUnavailableException(
        `Estado de elección inválido: ${estado}`,
      );
    }

    const provider = this.createProvider();
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
      const decodedName = this.decodeContractErrorName(
        error,
        MERKLE_ROOT_STORE_ABI,
      );
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
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

    this.indexTxSilently(electionId, receipt.hash);

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  private indexTxSilently(idEleccion: number, txHash: string): void {
    if (!txHash?.trim()) {
      return;
    }
    this.transaccionBlockchainService.indexarSilencioso(idEleccion, txHash);
  }

  /**
   * VOTAR-323: deploys per-election stack via ElectionFactory.createElection,
   * sealing RevoteConfig.enabled for the comicio lifecycle.
   */
  async deployElectionStack(
    idEleccion: number,
    revoteConfig: RevoteConfigOnChain,
  ): Promise<DeployElectionStackResult> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];

    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!rpcUrl || !privateKey) {
      throw new ServiceUnavailableException(
        'El despliegue on-chain no está configurado (SEPOLIA_RPC_URL, PRIVATE_KEY).',
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

    const provider = this.createProvider();
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
      const decodedName = this.decodeContractErrorName(
        error,
        ELECTION_FACTORY_CONTRACT_ABI,
      );
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee DEFAULT_ADMIN_ROLE en ElectionFactory.',
        );
      }
      if (
        decodedName === 'ElectionAlreadyExists' ||
        message.includes('ElectionAlreadyExists')
      ) {
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

    this.indexTxSilently(idEleccion, receipt.hash);

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
   * VOTAR-327: seals the RevoteConfig audit trail on ElectionFactory.
   * RevoteConfig has no setter — it is frozen since {deployElectionStack}'s
   * createElection call — so this is a declarative seal, not a functional
   * guard; see ElectionFactory.lockConfig NatSpec. One-shot on-chain,
   * idempotent on retry like {lockElectionWindow}.
   */
  async lockRevoteConfig(
    idEleccion: number,
  ): Promise<{ txHash: string; blockNumber: number; alreadyLocked: boolean }> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const privateKey = this.configService.get<string>('PRIVATE_KEY');

    if (!rpcUrl || !privateKey) {
      throw new ServiceUnavailableException(
        'El sellado de RevoteConfig on-chain no está configurado (SEPOLIA_RPC_URL, PRIVATE_KEY).',
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

    const provider = this.createProvider();
    const wallet = new Wallet(privateKey, provider);
    const contract = new Contract(
      factoryAddress,
      ELECTION_FACTORY_CONTRACT_ABI,
      wallet,
    ) as unknown as {
      lockConfig(electionId: number): Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract.lockConfig(idEleccion);
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      const decodedName = this.decodeContractErrorName(
        error,
        ELECTION_FACTORY_CONTRACT_ABI,
      );

      if (decodedName === 'ConfigLocked' || message.includes('ConfigLocked')) {
        this.logger.warn(
          `La configuración de re-voto del comicio ${idEleccion} ya estaba sellada on-chain; se omite el reintento.`,
        );
        return { txHash: '', blockNumber: 0, alreadyLocked: true };
      }
      if (
        decodedName === 'ElectionDoesNotExist' ||
        message.includes('ElectionDoesNotExist')
      ) {
        throw new UnprocessableEntityException(
          `El comicio ${idEleccion} no tiene stack electoral desplegado on-chain (ElectionFactory.getElection sin deployment).`,
        );
      }
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee DEFAULT_ADMIN_ROLE en ElectionFactory.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo sellar la configuración de re-voto on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        'El sellado de RevoteConfig no devolvió recibo de confirmación.',
      );
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      alreadyLocked: false,
    };
  }

  /**
   * VOTAR-364: resolves AuditView address for an election.
   * Prefer ElectionFactory.getElection(...).auditView; fallback ADMIN_MULTISIG_ADDRESS.
   */
  async resolveAuditViewAddress(electionId: number): Promise<string> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
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
        const provider = this.createProvider();
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
        // Fall through to ADMIN_MULTISIG_ADDRESS fallback.
      }
    }
    const fallback = this.configService.get<string>('ADMIN_MULTISIG_ADDRESS');
    if (fallback && fallback.toLowerCase() !== ZERO_ADDRESS) {
      return fallback;
    }
    throw new ServiceUnavailableException(
      'No hay contrato AuditView disponible para este comicio (ElectionFactory sin deployment ni ADMIN_MULTISIG_ADDRESS).',
    );
  }

  /**
   * VOTAR-364: reads participation aggregates from AuditViewContract.
   */
  async fetchParticipationStats(
    auditViewAddress: string,
    electionId: number,
  ): Promise<ParticipationStatsOnChain> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'La lectura de resultados on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }
    const provider = this.createProvider();
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
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'La lectura de resultados on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }
    const provider = this.createProvider();
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
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );

    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new ServiceUnavailableException(
        'La sincronización de ventana on-chain no está configurada (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS, PRIVATE_KEY).',
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

    const provider = this.createProvider();
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
      const decodedName = this.decodeContractErrorName(
        error,
        MERKLE_ROOT_STORE_ABI,
      );

      // VOTAR-327: a retried transitionToAbierta may re-run this step after
      // lockConfig already sealed the window — treat that as a no-op instead
      // of failing the whole transition.
      if (decodedName === 'ConfigLocked' || message.includes('ConfigLocked')) {
        this.logger.warn(
          `La ventana electoral del comicio ${electionId} ya está sellada on-chain; se omite la reescritura (VOTAR-327).`,
        );
        return { txHash: '', blockNumber: 0 };
      }
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee ELECTION_ADMIN_ROLE en el contrato.',
        );
      }
      if (
        decodedName === 'InvalidElectionWindow' ||
        message.includes('InvalidElectionWindow')
      ) {
        throw new ServiceUnavailableException(
          'La ventana de votación configurada para el comicio es inválida.',
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

    this.indexTxSilently(electionId, receipt.hash);

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * VOTAR-327: seals the voting window on MerkleRootStore so setElectionWindow
   * reverts with ConfigLocked afterwards. One-shot on-chain — a second call
   * for the same election is treated as idempotent (already locked, not an
   * error) so retrying `transitionToAbierta` never fails on this step alone
   * (mirrors the registerCandidates/CandidateSetSealed pattern of VOTAR-345).
   */
  async lockElectionWindow(
    electionId: number,
  ): Promise<{ txHash: string; blockNumber: number; alreadyLocked: boolean }> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const contractAddress = this.configService.get<string>(
      'MERKLE_ROOT_STORE_ADDRESS',
    );
    const privateKey = this.configService.get<string>('PRIVATE_KEY');

    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new ServiceUnavailableException(
        'El sellado de la ventana electoral on-chain no está configurado (SEPOLIA_RPC_URL, MERKLE_ROOT_STORE_ADDRESS, PRIVATE_KEY).',
      );
    }

    const provider = this.createProvider();
    const wallet = new Wallet(privateKey, provider);
    const contract = new Contract(
      contractAddress,
      MERKLE_ROOT_STORE_ABI,
      wallet,
    ) as unknown as {
      lockConfig(electionId: number): Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract.lockConfig(electionId);
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      const decodedName = this.decodeContractErrorName(
        error,
        MERKLE_ROOT_STORE_ABI,
      );

      if (decodedName === 'ConfigLocked' || message.includes('ConfigLocked')) {
        this.logger.warn(
          `La ventana electoral del comicio ${electionId} ya estaba sellada on-chain; se omite el reintento.`,
        );
        return { txHash: '', blockNumber: 0, alreadyLocked: true };
      }
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee ELECTION_ADMIN_ROLE en el contrato.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo sellar la ventana electoral on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        'El sellado de la ventana electoral no devolvió recibo de confirmación.',
      );
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      alreadyLocked: false,
    };
  }

  /**
   * VOTAR-347 — pauses BallotContract + VoteRegistry for a comicio (emergency
   * stop). Deliberately does NOT touch MerkleRootStore/ElectionFactory (shared
   * singletons across every election) — pausing those would freeze the whole
   * platform, out of scope for a per-comicio pause. Idempotent: if a contract
   * is already paused, that leg is reported via `alreadyPaused` rather than
   * failing the whole operation (the caller — PausaComicioService — may retry
   * after a partial failure on a prior confirmation).
   */
  async pauseElection(
    idEleccion: number,
    reason: string,
  ): Promise<{
    ballotTxHash: string;
    voteRegistryTxHash: string;
    ballotAlreadyPaused: boolean;
    voteRegistryAlreadyPaused: boolean;
  }> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!rpcUrl || !privateKey) {
      throw new ServiceUnavailableException(
        'La pausa on-chain no está configurada (SEPOLIA_RPC_URL, PRIVATE_KEY).',
      );
    }

    const { ballot: ballotAddress, voteRegistry: voteRegistryAddress } =
      await this.resolveElectionContracts(idEleccion);

    const provider = this.createProvider();
    const wallet = new Wallet(privateKey, provider);

    // Secuencial, no Promise.all: un mismo Wallet enviando dos txs en paralelo
    // puede pedirle el nonce al provider dos veces antes de que la primera tx
    // quede "pending" en el nodo, y la segunda llega con el mismo nonce →
    // "replacement transaction underpriced". Esperar la confirmación de la
    // primera antes de mandar la segunda evita la colisión.
    const ballotResult = await this.pauseContract(
      ballotAddress,
      BALLOT_CONTRACT_ABI,
      wallet,
      reason,
      'BallotContract',
      idEleccion,
    );
    const voteRegistryResult = await this.pauseContract(
      voteRegistryAddress,
      VOTE_REGISTRY_CONTRACT_ABI,
      wallet,
      reason,
      'VoteRegistry',
      idEleccion,
    );

    return {
      ballotTxHash: ballotResult.txHash,
      voteRegistryTxHash: voteRegistryResult.txHash,
      ballotAlreadyPaused: ballotResult.alreadyPaused,
      voteRegistryAlreadyPaused: voteRegistryResult.alreadyPaused,
    };
  }

  /**
   * VOTAR-347 — resumes BallotContract + VoteRegistry for a comicio. See
   * {@link pauseElection} for the singleton-exclusion and idempotency notes.
   */
  async unpauseElection(idEleccion: number): Promise<{
    ballotTxHash: string;
    voteRegistryTxHash: string;
    ballotAlreadyUnpaused: boolean;
    voteRegistryAlreadyUnpaused: boolean;
  }> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!rpcUrl || !privateKey) {
      throw new ServiceUnavailableException(
        'La reanudación on-chain no está configurada (SEPOLIA_RPC_URL, PRIVATE_KEY).',
      );
    }

    const { ballot: ballotAddress, voteRegistry: voteRegistryAddress } =
      await this.resolveElectionContracts(idEleccion);

    const provider = this.createProvider();
    const wallet = new Wallet(privateKey, provider);

    // Secuencial — ver comentario equivalente en pauseElection.
    const ballotResult = await this.unpauseContract(
      ballotAddress,
      BALLOT_CONTRACT_ABI,
      wallet,
      'BallotContract',
      idEleccion,
    );
    const voteRegistryResult = await this.unpauseContract(
      voteRegistryAddress,
      VOTE_REGISTRY_CONTRACT_ABI,
      wallet,
      'VoteRegistry',
      idEleccion,
    );

    return {
      ballotTxHash: ballotResult.txHash,
      voteRegistryTxHash: voteRegistryResult.txHash,
      ballotAlreadyUnpaused: ballotResult.alreadyUnpaused,
      voteRegistryAlreadyUnpaused: voteRegistryResult.alreadyUnpaused,
    };
  }

  private async pauseContract(
    address: string,
    abi: InterfaceAbi,
    wallet: Wallet,
    reason: string,
    label: string,
    idEleccion: number,
  ): Promise<{ txHash: string; alreadyPaused: boolean }> {
    const contract = new Contract(address, abi, wallet) as unknown as {
      'pause(string)': (reason: string) => Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract['pause(string)'](reason);
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      const decodedName = await this.decodeMinedRevertErrorName(error, abi);

      if (
        decodedName === 'EnforcedPause' ||
        message.includes('EnforcedPause')
      ) {
        this.logger.warn(
          `${label} del comicio ${idEleccion} ya estaba pausado on-chain; se omite el reintento.`,
        );
        return { txHash: '', alreadyPaused: true };
      }
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          `La cuenta configurada no posee PAUSER_ROLE en ${label}.`,
        );
      }
      if (this.isReplacementUnderpricedError(error)) {
        throw new ServiceUnavailableException(
          `Ya hay otra transacción de la misma cuenta operativa en curso para ${label}. ` +
            'Esperá un momento a que confirme en Sepolia y volvé a intentar la pausa.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo pausar ${label} on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        `La pausa de ${label} no devolvió recibo de confirmación.`,
      );
    }

    this.indexTxSilently(idEleccion, receipt.hash);
    return { txHash: receipt.hash, alreadyPaused: false };
  }

  private async unpauseContract(
    address: string,
    abi: InterfaceAbi,
    wallet: Wallet,
    label: string,
    idEleccion: number,
  ): Promise<{ txHash: string; alreadyUnpaused: boolean }> {
    const contract = new Contract(address, abi, wallet) as unknown as {
      unpause: () => Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract.unpause();
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      const decodedName = await this.decodeMinedRevertErrorName(error, abi);

      if (
        decodedName === 'ExpectedPause' ||
        message.includes('ExpectedPause')
      ) {
        this.logger.warn(
          `${label} del comicio ${idEleccion} ya estaba activo on-chain; se omite el reintento.`,
        );
        return { txHash: '', alreadyUnpaused: true };
      }
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          `La cuenta configurada no posee PAUSER_ROLE en ${label}.`,
        );
      }
      if (this.isReplacementUnderpricedError(error)) {
        throw new ServiceUnavailableException(
          `Ya hay otra transacción de la misma cuenta operativa en curso para ${label}. ` +
            'Esperá un momento a que confirme en Sepolia y volvé a intentar la reanudación.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo reanudar ${label} on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        `La reanudación de ${label} no devolvió recibo de confirmación.`,
      );
    }

    this.indexTxSilently(idEleccion, receipt.hash);
    return { txHash: receipt.hash, alreadyUnpaused: false };
  }

  /**
   * VOTAR-345: seals the votable candidate set on VoteRegistry before an
   * election opens. One-shot on-chain — a second call for the same election
   * is treated as idempotent (the set is already sealed, not an error) so
   * retrying `transitionToAbierta` never fails on this step alone.
   */
  async registerCandidates(
    idEleccion: number,
    candidateIds: number[],
  ): Promise<{ txHash: string; blockNumber: number; alreadySealed: boolean }> {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];

    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!rpcUrl || !privateKey) {
      throw new ServiceUnavailableException(
        'El sellado del set de candidatos on-chain no está configurado (SEPOLIA_RPC_URL, PRIVATE_KEY).',
      );
    }

    const { voteRegistry: voteRegistryAddress } =
      await this.resolveElectionContracts(idEleccion);

    const provider = this.createProvider();
    const wallet = new Wallet(privateKey, provider);
    const contract = new Contract(
      voteRegistryAddress,
      VOTE_REGISTRY_CONTRACT_ABI,
      wallet,
    ) as unknown as {
      registerCandidates(
        electionId: number,
        ids: number[],
      ): Promise<ContractTransactionResponse>;
    };

    let receipt: ContractTransactionReceipt | null;
    try {
      const tx = await contract.registerCandidates(idEleccion, candidateIds);
      receipt = await tx.wait(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      // ethers only decodes custom-error names via the contract ABI on
      // staticCall/call — send()'s internal estimateGas failure (the path
      // hit here) never populates error.message with the error name, only
      // the raw revert data. Decode that data ourselves so the string
      // fallbacks below aren't the only signal.
      const decodedName = this.decodeContractErrorName(
        error,
        VOTE_REGISTRY_CONTRACT_ABI,
      );

      if (
        decodedName === 'CandidateSetSealed' ||
        message.includes('CandidateSetSealed')
      ) {
        this.logger.warn(
          `El set de candidatos del comicio ${idEleccion} ya estaba sellado on-chain; se omite el reintento.`,
        );
        return { txHash: '', blockNumber: 0, alreadySealed: true };
      }
      if (
        decodedName === 'ReservedCandidateId' ||
        message.includes('ReservedCandidateId')
      ) {
        throw new UnprocessableEntityException(
          `Uno de los candidatos del comicio ${idEleccion} colisiona con un id reservado (blanco/nulo).`,
        );
      }
      if (
        decodedName === 'AccessControlUnauthorizedAccount' ||
        message.includes('AccessControlUnauthorizedAccount') ||
        message.includes('missing role')
      ) {
        throw new ServiceUnavailableException(
          'La cuenta configurada no posee ELECTION_ADMIN_ROLE en el VoteRegistry.',
        );
      }
      throw new ServiceUnavailableException(
        `No se pudo sellar el set de candidatos on-chain: ${message}`,
      );
    }

    if (!receipt) {
      throw new ServiceUnavailableException(
        'El sellado del set de candidatos no devolvió recibo de confirmación.',
      );
    }

    this.indexTxSilently(idEleccion, receipt.hash);

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      alreadySealed: false,
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

    this.requireRpcUrl();
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

    const provider = this.createProvider();
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
   * VOTAR-367 — public contract audit metadata for dashboard auditors.
   */
  async getContratoEstadoOnChain(
    idEleccion: number,
  ): Promise<ContratoEstadoOnChain> {
    const addresses = await this.resolveElectionContracts(idEleccion);
    const provider = this.createProvider();
    const auditView = new Contract(
      addresses.auditView,
      AUDIT_VIEW_CONTRACT_ABI,
      provider,
    ) as unknown as {
      getElectionState: (electionId: number) => Promise<number | bigint>;
      merkleRootStore: () => Promise<string>;
    };

    let stateCode: number;
    let merkleRootStoreAddress: string;
    try {
      [stateCode, merkleRootStoreAddress] = await Promise.all([
        auditView.getElectionState(idEleccion).then((value) => Number(value)),
        auditView.merkleRootStore(),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo consultar el estado del contrato on-chain: ${message}`,
      );
    }

    const merkleStore = new Contract(
      merkleRootStoreAddress,
      MERKLE_ROOT_STORE_ABI,
      provider,
    ) as unknown as MerkleRootStoreContract;

    let root: string;
    let timestamp: bigint;
    let publicado: boolean;
    try {
      [[root, timestamp], publicado] = await Promise.all([
        merkleStore.getMerkleRoot(idEleccion),
        merkleStore.isPublished(idEleccion),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo consultar la raíz Merkle on-chain: ${message}`,
      );
    }

    const revote = await this.resolveRevoteLimitsOnChain(idEleccion, addresses);

    const toContratoDireccion = (
      direccion: string,
    ): ContratoDireccionOnChain => ({
      direccion,
      explorerUrl: this.buildExplorerAddressUrl(direccion),
    });

    const timestampSeconds = Number(timestamp);
    const publicadoEn =
      publicado && timestampSeconds > 0
        ? new Date(timestampSeconds * 1000).toISOString()
        : null;

    return {
      estadoOnChain: {
        codigo: stateCode,
        etiqueta: BLOCKCHAIN_STATE_LABELS[stateCode] ?? 'DESCONOCIDO',
      },
      merkleRoot: {
        hash: root === ZERO_MERKLE_ROOT ? ZERO_MERKLE_ROOT : root,
        publicado,
        publicadoEn,
        consistente: !(publicado && root === ZERO_MERKLE_ROOT),
      },
      revoto: revote,
      contratos: {
        ballot: toContratoDireccion(addresses.ballot),
        voteRegistry: toContratoDireccion(addresses.voteRegistry),
        auditView: toContratoDireccion(addresses.auditView),
        merkleRootStore: toContratoDireccion(merkleRootStoreAddress),
      },
      red: this.getNetworkDisplayName(),
      chainId: this.getChainId(),
    };
  }

  /**
   * VOTAR-365 / VOTAR-350: aggregate participation via AuditViewContract.
   */
  async getParticipationStats(
    idEleccion: number,
  ): Promise<ParticipationStatsOnChain> {
    const addresses = await this.resolveElectionContracts(idEleccion);
    const provider = this.createProvider();
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
    const provider = this.createProvider();
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
    const provider = this.createProvider();
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

  /**
   * VOTAR-329 — aggregate revote metrics via AuditViewContract.getRevoteStats.
   * Falls back to the VOTAR-373 transaction index when the deployed AuditView
   * predates getRevoteStats (non-upgradeable contracts; eth_getLogs is capped).
   */
  async getRevoteStats(idEleccion: number): Promise<RevoteStatsOnChain> {
    const addresses = await this.resolveElectionContracts(idEleccion);
    const provider = this.createProvider();
    const auditView = new Contract(
      addresses.auditView,
      AUDIT_VIEW_CONTRACT_ABI,
      provider,
    ) as unknown as AuditViewContract;

    try {
      const [totalRevotes, uniqueVoters, overwriteRatioWad] =
        await auditView.getRevoteStats(idEleccion);
      return {
        totalRevotes: Number(totalRevotes),
        uniqueVoters: Number(uniqueVoters),
        overwriteRatio: Number(overwriteRatioWad) / 1e18,
      };
    } catch (error) {
      if (!isMissingOnChainSelectorError(error)) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error desconocido en blockchain';
        throw new ServiceUnavailableException(
          `No se pudieron obtener las estadísticas de re-voto on-chain: ${message}`,
        );
      }

      this.logger.warn(
        `getRevoteStats ausente en AuditView ${addresses.auditView} (elección ${idEleccion}); derivando desde índice transaccion_blockchain.`,
      );

      try {
        return await this.transaccionBlockchainService.buildRevoteStatsFromIndex(
          idEleccion,
        );
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : 'Error desconocido en blockchain';
        throw new ServiceUnavailableException(
          `No se pudieron obtener las estadísticas de re-voto on-chain: ${message}`,
        );
      }
    }
  }

  /**
   * VOTAR-373 — parses a single confirmed tx receipt into one public audit row.
   * Uses getTransactionReceipt (1 RPC), not eth_getLogs range scans.
   */
  async parseElectionTransactionAuditEntry(
    txHash: string,
    idEleccion: number,
  ): Promise<(BlockchainTransactionAuditEntry & { logIndex: number }) | null> {
    const provider = this.createProvider();
    let receipt: TransactionReceipt | null;
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

    if (!receipt || receipt.status !== 1) {
      return null;
    }

    const addresses = await this.resolveElectionContracts(idEleccion);
    const merkleRootStoreAddress =
      this.configService.get<string>('MERKLE_ROOT_STORE_ADDRESS') ??
      ZERO_ADDRESS;

    const ballotIface = new Interface(BALLOT_CONTRACT_ABI);
    const registryIface = new Interface(VOTE_REGISTRY_CONTRACT_ABI);
    const merkleIface = new Interface(MERKLE_ROOT_STORE_ABI);

    const addressLabels = new Map<string, string>();
    addressLabels.set(addresses.ballot.toLowerCase(), 'BallotContract');
    addressLabels.set(addresses.voteRegistry.toLowerCase(), 'VoteRegistry');
    if (merkleRootStoreAddress !== ZERO_ADDRESS) {
      addressLabels.set(
        merkleRootStoreAddress.toLowerCase(),
        'MerkleRootStore',
      );
    }

    type RawScannedEvent = {
      logIndex: number;
      contractLabel: string;
      eventName: string;
      description: string;
    };

    const rawEvents: RawScannedEvent[] = [];

    for (const log of receipt.logs) {
      const logAddress = log.address?.toLowerCase();
      if (!logAddress) {
        continue;
      }

      const contractLabel = addressLabels.get(logAddress);
      if (!contractLabel) {
        continue;
      }

      let parsed: ReturnType<Interface['parseLog']> | null = null;
      try {
        if (contractLabel === 'BallotContract') {
          parsed = ballotIface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
        } else if (contractLabel === 'VoteRegistry') {
          parsed = registryIface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
        } else if (contractLabel === 'MerkleRootStore') {
          parsed = merkleIface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
        }
      } catch {
        parsed = null;
      }

      if (!parsed) {
        continue;
      }

      const args = parsed.args as ReadonlyArray<unknown> &
        Record<string, unknown>;
      const eventElectionId = Number(args[0] ?? args.electionId);
      if (
        Number.isFinite(eventElectionId) &&
        eventElectionId > 0 &&
        eventElectionId !== idEleccion
      ) {
        continue;
      }

      const eventName = parsed.name;
      let description: string | null;
      switch (eventName) {
        case 'SignedVoteCast':
          description = this.describeSignedVoteCast(args);
          break;
        case 'VoteCast':
          description = this.describeVoteCast(args);
          break;
        case 'VoteUpdated':
          description = this.describeVoteUpdated(args);
          break;
        case 'CandidateSetRegistered':
          description = this.describeCandidateSetRegistered(args);
          break;
        case 'RootPublished':
          description = 'Raíz Merkle del padrón publicada on-chain';
          break;
        case 'ElectionStateChanged':
          description = this.describeElectionStateChanged(args);
          break;
        case 'ElectionWindowSet':
          description = this.describeElectionWindowSet(args);
          break;
        default:
          description = `Evento ${eventName} registrado on-chain`;
      }

      if (!description) {
        continue;
      }

      rawEvents.push({
        logIndex: log.index,
        contractLabel,
        eventName,
        description,
      });
    }

    if (rawEvents.length === 0) {
      return {
        hashTransaccion: receipt.hash.toLowerCase(),
        numeroBloque: receipt.blockNumber,
        marcaTiempo: await this.resolveBlockTimestampIso(
          provider,
          receipt.blockNumber,
        ),
        contratoEtiqueta: 'ElectionFactory',
        nombreEvento: 'OnChainOperation',
        descripcionLegible: 'Operación electoral registrada on-chain',
        explorerUrl: this.buildExplorerUrl(receipt.hash),
        logIndex: 0,
      };
    }

    const minLogIndex = Math.min(...rawEvents.map((event) => event.logIndex));
    const primary = rawEvents.find((event) => event.logIndex === minLogIndex)!;
    const eventNames = [...new Set(rawEvents.map((event) => event.eventName))];
    const descriptions = joinAuditDescriptions(
      rawEvents.map((event) => event.description),
    );

    return {
      hashTransaccion: receipt.hash.toLowerCase(),
      numeroBloque: receipt.blockNumber,
      marcaTiempo: await this.resolveBlockTimestampIso(
        provider,
        receipt.blockNumber,
      ),
      contratoEtiqueta: primary.contractLabel,
      nombreEvento: eventNames.join(', '),
      descripcionLegible: descriptions,
      explorerUrl: this.buildExplorerUrl(receipt.hash),
      logIndex: minLogIndex,
    };
  }

  private async resolveBlockTimestampIso(
    provider: Provider,
    blockNumber: number,
  ): Promise<string> {
    const block = await provider.getBlock(blockNumber);
    return block?.timestamp
      ? new Date(Number(block.timestamp) * 1000).toISOString()
      : new Date().toISOString();
  }

  /**
   * VOTAR-373 — scans election contract logs via RPC and returns a chronological,
   * privacy-safe audit trail (no nullifiers, voter hashes or selection hashes).
   * @deprecated Prefer TransaccionBlockchainService index + DB reads (Alchemy free tier).
   */
  async scanElectionTransactionHistory(
    idEleccion: number,
  ): Promise<BlockchainTransactionAuditEntry[]> {
    const addresses = await this.resolveElectionContracts(idEleccion);
    const provider = this.createProvider();
    const merkleRootStoreAddress =
      this.configService.get<string>('MERKLE_ROOT_STORE_ADDRESS') ??
      ZERO_ADDRESS;

    type EventContract = {
      filters: Record<string, (electionId: number) => unknown>;
      queryFilter: (filter: unknown) => Promise<
        Array<{
          transactionHash: string;
          blockNumber: number;
          index: number;
          eventName?: string;
          args: ReadonlyArray<unknown> & Record<string, unknown>;
        }>
      >;
    };

    const ballot = new Contract(
      addresses.ballot,
      BALLOT_CONTRACT_ABI,
      provider,
    ) as unknown as EventContract;
    const voteRegistry = new Contract(
      addresses.voteRegistry,
      VOTE_REGISTRY_CONTRACT_ABI,
      provider,
    ) as unknown as EventContract;
    const merkleRootStore =
      merkleRootStoreAddress !== ZERO_ADDRESS
        ? (new Contract(
            merkleRootStoreAddress,
            MERKLE_ROOT_STORE_ABI,
            provider,
          ) as unknown as EventContract)
        : null;

    let signedVoteEvents: Awaited<ReturnType<EventContract['queryFilter']>>;
    let voteCastEvents: Awaited<ReturnType<EventContract['queryFilter']>>;
    let voteUpdatedEvents: Awaited<ReturnType<EventContract['queryFilter']>>;
    let candidateSetEvents: Awaited<ReturnType<EventContract['queryFilter']>>;
    let rootPublishedEvents: Awaited<ReturnType<EventContract['queryFilter']>> =
      [];
    let electionStateEvents: Awaited<ReturnType<EventContract['queryFilter']>> =
      [];
    let electionWindowEvents: Awaited<
      ReturnType<EventContract['queryFilter']>
    > = [];

    try {
      [
        signedVoteEvents,
        voteCastEvents,
        voteUpdatedEvents,
        candidateSetEvents,
        rootPublishedEvents,
        electionStateEvents,
        electionWindowEvents,
      ] = await Promise.all([
        ballot.queryFilter(ballot.filters.SignedVoteCast(idEleccion)),
        voteRegistry.queryFilter(voteRegistry.filters.VoteCast(idEleccion)),
        voteRegistry.queryFilter(voteRegistry.filters.VoteUpdated(idEleccion)),
        voteRegistry.queryFilter(
          voteRegistry.filters.CandidateSetRegistered(idEleccion),
        ),
        merkleRootStore
          ? merkleRootStore.queryFilter(
              merkleRootStore.filters.RootPublished(idEleccion),
            )
          : Promise.resolve([]),
        merkleRootStore
          ? merkleRootStore.queryFilter(
              merkleRootStore.filters.ElectionStateChanged(idEleccion),
            )
          : Promise.resolve([]),
        merkleRootStore
          ? merkleRootStore.queryFilter(
              merkleRootStore.filters.ElectionWindowSet(idEleccion),
            )
          : Promise.resolve([]),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudo escanear la actividad on-chain del comicio: ${message}`,
      );
    }

    type RawScannedEvent = {
      txHash: string;
      blockNumber: number;
      logIndex: number;
      contractLabel: string;
      eventName: string;
      description: string;
    };

    const mapEvents = (
      events: Awaited<ReturnType<EventContract['queryFilter']>>,
      contractLabel: string,
      mapper: (
        eventName: string,
        args: ReadonlyArray<unknown> & Record<string, unknown>,
      ) => string | null,
    ): RawScannedEvent[] =>
      events
        .map((event) => {
          const eventName = String(event.eventName ?? 'Unknown');
          const description = mapper(eventName, event.args);
          if (!description) {
            return null;
          }
          return {
            txHash: event.transactionHash.toLowerCase(),
            blockNumber: event.blockNumber,
            logIndex: event.index,
            contractLabel,
            eventName,
            description,
          };
        })
        .filter((event): event is RawScannedEvent => event !== null);

    const rawEvents: RawScannedEvent[] = [
      ...mapEvents(signedVoteEvents, 'BallotContract', (_, args) =>
        this.describeSignedVoteCast(args),
      ),
      ...mapEvents(voteCastEvents, 'VoteRegistry', (_, args) =>
        this.describeVoteCast(args),
      ),
      ...mapEvents(voteUpdatedEvents, 'VoteRegistry', (_, args) =>
        this.describeVoteUpdated(args),
      ),
      ...mapEvents(candidateSetEvents, 'VoteRegistry', (_, args) =>
        this.describeCandidateSetRegistered(args),
      ),
      ...mapEvents(
        rootPublishedEvents,
        'MerkleRootStore',
        () => 'Raíz Merkle del padrón publicada on-chain',
      ),
      ...mapEvents(electionStateEvents, 'MerkleRootStore', (_, args) =>
        this.describeElectionStateChanged(args),
      ),
      ...mapEvents(electionWindowEvents, 'MerkleRootStore', (_, args) =>
        this.describeElectionWindowSet(args),
      ),
    ];

    const grouped = new Map<
      string,
      {
        blockNumber: number;
        logIndex: number;
        contractLabel: string;
        eventNames: string[];
        descriptions: string[];
      }
    >();

    for (const event of rawEvents) {
      const existing = grouped.get(event.txHash);
      if (!existing) {
        grouped.set(event.txHash, {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          contractLabel: event.contractLabel,
          eventNames: [event.eventName],
          descriptions: [event.description],
        });
        continue;
      }
      existing.logIndex = Math.min(existing.logIndex, event.logIndex);
      if (!existing.eventNames.includes(event.eventName)) {
        existing.eventNames.push(event.eventName);
      }
      if (
        event.description &&
        !existing.descriptions.includes(event.description)
      ) {
        existing.descriptions.push(event.description);
      }
    }

    const blockTimestampCache = new Map<number, string>();
    const entries: Array<
      BlockchainTransactionAuditEntry & {
        sortBlock: number;
        sortLogIndex: number;
      }
    > = [];

    for (const [txHash, group] of grouped.entries()) {
      let marcaTiempo = blockTimestampCache.get(group.blockNumber);
      if (!marcaTiempo) {
        const block = await provider.getBlock(group.blockNumber);
        marcaTiempo = block?.timestamp
          ? new Date(Number(block.timestamp) * 1000).toISOString()
          : new Date().toISOString();
        blockTimestampCache.set(group.blockNumber, marcaTiempo);
      }

      entries.push({
        hashTransaccion: txHash,
        numeroBloque: group.blockNumber,
        marcaTiempo,
        contratoEtiqueta: group.contractLabel,
        nombreEvento: group.eventNames.join(', '),
        descripcionLegible: joinAuditDescriptions(group.descriptions),
        explorerUrl: this.buildExplorerUrl(txHash),
        sortBlock: group.blockNumber,
        sortLogIndex: group.logIndex,
      });
    }

    return entries
      .sort((a, b) =>
        a.sortBlock !== b.sortBlock
          ? b.sortBlock - a.sortBlock
          : b.sortLogIndex - a.sortLogIndex,
      )
      .map(
        (entry): BlockchainTransactionAuditEntry => ({
          hashTransaccion: entry.hashTransaccion,
          numeroBloque: entry.numeroBloque,
          marcaTiempo: entry.marcaTiempo,
          contratoEtiqueta: entry.contratoEtiqueta,
          nombreEvento: entry.nombreEvento,
          descripcionLegible: entry.descripcionLegible,
          explorerUrl: entry.explorerUrl,
        }),
      );
  }

  private describeSignedVoteCast(
    args: ReadonlyArray<unknown> & Record<string, unknown>,
  ): string {
    void args;
    return 'Sufragio firmado registrado en la urna digital';
  }

  private describeVoteCast(
    args: ReadonlyArray<unknown> & Record<string, unknown>,
  ): string {
    void args;
    return describeVoteCastAudit();
  }

  private describeVoteUpdated(
    args: ReadonlyArray<unknown> & Record<string, unknown>,
  ): string | null {
    return describeVoteUpdatedAudit(args);
  }

  private describeCandidateSetRegistered(
    args: ReadonlyArray<unknown> & Record<string, unknown>,
  ): string {
    const candidateCount = Number(args.candidateCount);
    return `Set de candidatos sellado (${candidateCount} candidatos)`;
  }

  private describeElectionStateChanged(
    args: ReadonlyArray<unknown> & Record<string, unknown>,
  ): string {
    const stateCode = Number(args.newState);
    const label = BLOCKCHAIN_STATE_LABELS[stateCode] ?? 'DESCONOCIDO';
    return `Estado electoral actualizado a ${label}`;
  }

  private describeElectionWindowSet(
    args: ReadonlyArray<unknown> & Record<string, unknown>,
  ): string {
    const startTime = Number(args.startTime);
    const endTime = Number(args.endTime);
    const format = (unixSeconds: number): string =>
      new Date(unixSeconds * 1000).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
      });
    return `Ventana electoral configurada (${format(startTime)} — ${format(endTime)})`;
  }

  /**
   * Decodes a contract custom error name from the raw revert data on an
   * ethers error. Needed because ethers only auto-decodes custom errors via
   * the contract ABI on staticCall/call; a real send() (the path every write
   * in this service takes) surfaces estimateGas failures as "unknown custom
   * error" in .message, with only the raw hex in .data. Generalized from
   * VOTAR-345's VoteRegistry-only version to cover any contract ABI,
   * including MerkleRootStore/ElectionFactory's ConfigLocked (VOTAR-327).
   */
  private decodeContractErrorName(
    error: unknown,
    abi: InterfaceAbi,
  ): string | undefined {
    const data = this.extractRevertData(error);
    if (!data) {
      return undefined;
    }
    try {
      return new Interface(abi).parseError(data)?.name;
    } catch {
      return undefined;
    }
  }

  private extractRevertData(error: unknown): string | undefined {
    const err = error as {
      data?: unknown;
      info?: { error?: { data?: unknown } };
    };
    const data = err?.data ?? err?.info?.error?.data;
    return typeof data === 'string' && data.startsWith('0x') ? data : undefined;
  }

  /**
   * VOTAR-347 — {@link decodeContractErrorName} only works when ethers already
   * attached the raw revert data to the error (true for pre-flight failures
   * like a failed estimateGas). A transaction that was actually broadcast and
   * MINED with `status: 0` does NOT carry revert data on its receipt — ethers
   * surfaces it as a bare CALL_EXCEPTION with `reason`/`data` both null. To
   * recover the reason (e.g. tell "already paused" apart from a real failure)
   * we replay the exact call at the block it reverted in.
   */
  private async decodeMinedRevertErrorName(
    error: unknown,
    abi: InterfaceAbi,
  ): Promise<string | undefined> {
    const direct = this.decodeContractErrorName(error, abi);
    if (direct) {
      return direct;
    }

    const err = error as {
      transaction?: { to?: string; from?: string; data?: string };
      receipt?: { blockNumber?: number };
    };
    if (!err?.transaction?.to || !err?.transaction?.data) {
      return undefined;
    }

    try {
      const provider = this.createProvider();
      await provider.call({
        to: err.transaction.to,
        from: err.transaction.from,
        data: err.transaction.data,
        blockTag: err.receipt?.blockNumber,
      });
      return undefined;
    } catch (replayError) {
      const data = this.extractRevertData(replayError);
      if (!data) {
        return undefined;
      }
      try {
        return new Interface(abi).parseError(data)?.name;
      } catch {
        return undefined;
      }
    }
  }

  /**
   * VOTAR-347 — ethers surfaces a stuck/colliding nonce (two txs from the same
   * wallet racing for the same nonce, or a prior tx still pending with a gas
   * price the new one doesn't beat) as ethers error code REPLACEMENT_UNDERPRICED
   * or NONCE_EXPIRED. Both mean "wait for the network, then retry" — not a
   * contract-level failure — so they get a distinct, human-readable message.
   */
  private isReplacementUnderpricedError(error: unknown): boolean {
    const code = (error as { code?: string })?.code;
    return code === 'REPLACEMENT_UNDERPRICED' || code === 'NONCE_EXPIRED';
  }

  private requireRpcUrl(): string {
    const rpcUrl = this.rpcProviderFactory.getUrls()[0];
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'La consulta on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }
    return rpcUrl;
  }

  private createProvider(): Provider {
    return this.rpcProviderFactory.create();
  }

  private explorerBaseUrl(): string {
    return (
      this.configService.get<string>('ETHERSCAN_BASE_URL') ??
      'https://sepolia.etherscan.io'
    );
  }

  private async resolveRevoteLimitsOnChain(
    idEleccion: number,
    addresses: ElectionContractAddresses,
  ): Promise<ContratoEstadoOnChain['revoto']> {
    const fromFactory = await this.fetchRevoteConfigFromFactory(idEleccion);
    if (fromFactory) {
      return {
        habilitado: fromFactory.enabled,
        maxVotosPorVotante: fromFactory.maxVotesPerVoter,
        minIntervaloSegundos: fromFactory.minIntervalSeconds,
        politicaRevoto: fromFactory.enabled ? 'LAST_VOTE_WINS' : 'DISABLED',
      };
    }

    const provider = this.createProvider();
    const ballot = new Contract(
      addresses.ballot,
      BALLOT_REVOTE_READ_ABI,
      provider,
    ) as unknown as {
      maxVotesPerVoter: () => Promise<number | bigint>;
      minIntervalSeconds: () => Promise<number | bigint>;
    };
    const voteRegistry = new Contract(
      addresses.voteRegistry,
      VOTE_REGISTRY_REVOTE_READ_ABI,
      provider,
    ) as unknown as {
      revoteEnabled: () => Promise<boolean>;
    };

    try {
      const [habilitado, maxVotosPorVotante, minIntervaloSegundos] =
        await Promise.all([
          voteRegistry.revoteEnabled(),
          ballot.maxVotesPerVoter().then((value) => Number(value)),
          ballot.minIntervalSeconds().then((value) => Number(value)),
        ]);

      return {
        habilitado,
        maxVotosPorVotante,
        minIntervaloSegundos,
        politicaRevoto: habilitado ? 'LAST_VOTE_WINS' : 'DISABLED',
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en blockchain';
      throw new ServiceUnavailableException(
        `No se pudieron consultar los límites de re-voto on-chain: ${message}`,
      );
    }
  }

  private async fetchRevoteConfigFromFactory(
    idEleccion: number,
  ): Promise<RevoteConfigOnChain | null> {
    if (this.resolveContractsFromEnv()) {
      return null;
    }

    this.requireRpcUrl();
    let factory: { direccionContrato: string };
    try {
      factory = await this.contratoBlockchainService.getElectionFactory();
    } catch {
      return null;
    }

    const provider = this.createProvider();
    const contract = new Contract(
      factory.direccionContrato,
      ELECTION_FACTORY_GET_ELECTION_ABI,
      provider,
    ) as unknown as {
      getElection: (electionId: number) => Promise<{
        revoteConfig: RevoteConfigOnChain;
        exists: boolean;
      }>;
    };

    try {
      const deployment = await contract.getElection(idEleccion);
      if (!deployment.exists) {
        return null;
      }
      return {
        enabled: deployment.revoteConfig.enabled,
        maxVotesPerVoter: Number(deployment.revoteConfig.maxVotesPerVoter),
        minIntervalSeconds: Number(deployment.revoteConfig.minIntervalSeconds),
        policy: Number(deployment.revoteConfig.policy),
      };
    } catch {
      return null;
    }
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
