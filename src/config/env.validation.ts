import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DEVELOPMENT: Joi.boolean().truthy('true').falsy('false').default(false),
  REQUIRE_HTTPS: Joi.boolean().truthy('true').falsy('false').default(false),
  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  UPLOADS_DIR: Joi.string().default('uploads'),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_VOTER_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('8h'),
  JWT_EXPIRES_IN: Joi.string().optional(),
  AUTOGESTION_BASE_URL: Joi.string()
    .uri()
    .default('https://webservice.frvm.utn.edu.ar/autogestion'),
  SEPOLIA_RPC_URL: Joi.string().uri().optional(),
  MERKLE_ROOT_STORE_ADDRESS: Joi.string().optional(),
  MERKLE_UPDATER_PRIVATE_KEY: Joi.string().optional(),
  BALLOT_CONTRACT_ADDRESS: Joi.string().optional(),
  ELECTION_FACTORY_ADDRESS: Joi.string().optional(),
  RECIBO_SIGNING_PRIVATE_KEY: Joi.string().optional(),
  CHAIN_ID: Joi.number().default(11155111),
  ETHERSCAN_BASE_URL: Joi.string()
    .uri()
    .allow('')
    .default('https://sepolia.etherscan.io'),
  ELECTION_FACTORY_ARTIFACT_PATH: Joi.string().optional(),
  ELECTION_FACTORY_NETWORK: Joi.string().optional(),
});
