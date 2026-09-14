import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  Wallet,
  type ContractTransactionResponse,
  type Provider,
} from 'ethers';
import { RpcProviderFactory } from '@/blockchain/rpc/rpc-provider.factory';
import { BALLOT_CAST_ABI } from '@/relayer/ballot-cast.abi';
import {
  applyGasMargin,
  mapCastFailure,
  RelayCastFailedError,
} from '@/relayer/relay-errors';
import { VaultService } from '@/vault/vault.service';

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

export type RelayBroadcastInput = {
  contractAddress: string;
  electionId: number;
  voterLeaf: string;
  nullifier: string;
  selectionHash: string;
  candidateIds: bigint[];
  timestamp: bigint;
  expectedSigner: string;
  merkleProof: string[];
  signature: string;
  validatorSignature: string;
};

@Injectable()
export class EthersRelayBroadcaster {
  private readonly logger = new Logger(EthersRelayBroadcaster.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly vaultService: VaultService,
    private readonly rpcProviderFactory: RpcProviderFactory,
  ) {}

  async castSignedVote(input: RelayBroadcastInput): Promise<string> {
    const provider = this.requireProvider();
    const wallet = new Wallet(this.requireRelayerKey(), provider);
    const contract = new Contract(
      input.contractAddress,
      BALLOT_CAST_ABI,
      wallet,
    );
    const args = [
      {
        electionId: input.electionId,
        voterLeaf: input.voterLeaf,
        nullifier: input.nullifier,
        selectionHash: input.selectionHash,
        candidateIds: input.candidateIds,
        timestamp: input.timestamp,
        expectedSigner: input.expectedSigner,
      },
      input.merkleProof,
      input.signature,
      input.validatorSignature,
    ] as const;

    try {
      await contract.castSignedVote.staticCall(...args);
    } catch (error) {
      throw new RelayCastFailedError(mapCastFailure(error), false);
    }

    let gasLimit: bigint;
    try {
      gasLimit = applyGasMargin(
        await contract.castSignedVote.estimateGas(...args),
      );
    } catch (error) {
      throw new RelayCastFailedError(mapCastFailure(error), false);
    }

    try {
      const tx = (await contract.castSignedVote(...args, {
        gasLimit,
      })) as ContractTransactionResponse;
      this.logger.log(
        `castSignedVote transmitido comicio=${input.electionId} tx=${tx.hash}`,
      );
      return tx.hash;
    } catch (error) {
      throw new RelayCastFailedError(mapCastFailure(error), true);
    }
  }

  private requireProvider(): Provider {
    if (!this.rpcProviderFactory.hasUrls()) {
      throw new ServiceUnavailableException(
        'El relayer no está configurado (SEPOLIA_RPC_URL).',
      );
    }
    return this.rpcProviderFactory.create();
  }

  private requireRelayerKey(): string {
    const dedicated = this.vaultService.getSecret('RELAYER_PRIVATE_KEY');
    if (dedicated && PRIVATE_KEY.test(dedicated)) {
      return dedicated;
    }
    const development = this.configService.get<boolean>('DEVELOPMENT') === true;
    const operational = this.vaultService.getSecret('PRIVATE_KEY');
    if (development && operational && PRIVATE_KEY.test(operational)) {
      this.logger.warn(
        'RELAYER_PRIVATE_KEY ausente; se usa PRIVATE_KEY sólo porque DEVELOPMENT=true.',
      );
      return operational;
    }
    throw new ServiceUnavailableException(
      'El relayer no está configurado (RELAYER_PRIVATE_KEY en el vault).',
    );
  }
}
