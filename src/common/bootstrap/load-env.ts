import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/*
  Loads `.env` first.
 
  `.env.blockchain.local` is only loaded when LOAD_BLOCKCHAIN_LOCAL=true is
  explicitly set, or when NODE_ENV=test (Jest injects local Hardhat addresses).
  This prevents local Hardhat settings from silently overriding Sepolia config
  when both files are present.
*/
export const loadEnv = (): void => {
  config({ path: resolve(process.cwd(), '.env') });

  const shouldLoadLocal =
    process.env['LOAD_BLOCKCHAIN_LOCAL'] === 'true' ||
    process.env['NODE_ENV'] === 'test';

  if (!shouldLoadLocal) return;

  const blockchainEnvPath = resolve(process.cwd(), '.env.blockchain.local');
  if (existsSync(blockchainEnvPath)) {
    config({ path: blockchainEnvPath, override: true });
  }
};

loadEnv();
