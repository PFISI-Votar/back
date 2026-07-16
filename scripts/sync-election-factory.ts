import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dataSource from '@/database/data-source';
import { ContratoBlockchainService } from '@/blockchain/services/contrato-blockchain.service';
import { RedBlockchain } from '@/blockchain/enums/contrato-blockchain.enum';
import { ContratoBlockchain } from '@/blockchain/entities/contrato-blockchain.entity';

type ElectionFactoryArtifact = {
  contractName: string;
  network: string;
  chainId: number;
  address: string;
  abi: unknown[];
  abiHash?: string;
  txHash?: string | null;
  admin?: string;
  merkleRootStore?: string;
  verified?: boolean;
  deployedAt?: string;
};

const NETWORK_TO_RED: Record<string, RedBlockchain> = {
  hardhat: RedBlockchain.LOCALHOST,
  localhost: RedBlockchain.LOCALHOST,
  sepolia: RedBlockchain.SEPOLIA,
  mainnet: RedBlockchain.MAINNET,
};

const resolveArtifactPath = (): string => {
  if (process.env.ELECTION_FACTORY_ARTIFACT_PATH) {
    return resolve(process.env.ELECTION_FACTORY_ARTIFACT_PATH);
  }
  const network = process.env.ELECTION_FACTORY_NETWORK ?? 'sepolia';
  return resolve(
    __dirname,
    `../../blockchain/deployments/${network}/ElectionFactory.json`,
  );
};

const mapRed = (network: string, chainId: number): RedBlockchain => {
  if (NETWORK_TO_RED[network]) {
    return NETWORK_TO_RED[network];
  }
  if (chainId === 11155111) return RedBlockchain.SEPOLIA;
  if (chainId === 1) return RedBlockchain.MAINNET;
  return RedBlockchain.LOCALHOST;
};

/**
 * VOTAR-337 / UAT-02 — Registers ElectionFactory address + ABI in PostgreSQL
 * from the Hardhat deployment artifact.
 *
 * Usage (from back/):
 *   npm run sync:election-factory
 *   ELECTION_FACTORY_NETWORK=localhost npm run sync:election-factory
 *   ELECTION_FACTORY_ARTIFACT_PATH=/path/to/ElectionFactory.json npm run sync:election-factory
 */
async function main() {
  const artifactPath = resolveArtifactPath();
  if (!existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found at ${artifactPath}. Run npm run deploy:factory:sepolia in blockchain/ first.`,
    );
  }

  const artifact = JSON.parse(
    readFileSync(artifactPath, 'utf8'),
  ) as ElectionFactoryArtifact;

  if (!artifact.address || !Array.isArray(artifact.abi)) {
    throw new Error(
      `Invalid ElectionFactory artifact at ${artifactPath}: missing address or abi`,
    );
  }

  const abiHash =
    artifact.abiHash ??
    `0x${createHash('sha256').update(JSON.stringify(artifact.abi)).digest('hex')}`;

  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(ContratoBlockchain);
    const service = new ContratoBlockchainService(repository);

    const saved = await service.upsertElectionFactory({
      direccionContrato: artifact.address,
      abi: artifact.abi,
      abiHash,
      red: mapRed(artifact.network, artifact.chainId),
      chainId: artifact.chainId,
      txHashDespliegue: artifact.txHash ?? null,
      fechaDespliegue: artifact.deployedAt
        ? new Date(artifact.deployedAt)
        : new Date(),
      verificadoEtherscan: artifact.verified ?? false,
      merkleRootStoreAddress: artifact.merkleRootStore ?? null,
      adminAddress: artifact.admin ?? null,
    });

    console.log('[sync:election-factory] Registered ElectionFactory in DB');
    console.log(`  id_contrato: ${saved.idContrato}`);
    console.log(`  address:     ${saved.direccionContrato}`);
    console.log(`  red:         ${saved.red} (chainId=${saved.chainId})`);
    console.log(`  abi_hash:    ${saved.abiHash}`);
    console.log(`  verified:    ${saved.verificadoEtherscan}`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
