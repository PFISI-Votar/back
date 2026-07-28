import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Loads `.env` and, when present, `.env.blockchain.local` with override so
 * local Hardhat settings win over Sepolia entries in `.env`.
 */
export const loadEnv = (): void => {
  config({ path: resolve(process.cwd(), '.env') });
  const blockchainEnvPath = resolve(process.cwd(), '.env.blockchain.local');
  if (existsSync(blockchainEnvPath)) {
    config({ path: blockchainEnvPath, override: true });
  }
};

loadEnv();
