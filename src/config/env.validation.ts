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
  /**
   * Legacy / opcional. Los access tokens usan RS256 + JWKS (VOTAR-314);
   * ya no se firma ni verifica con JWT_SECRET.
   */
  JWT_SECRET: Joi.string().min(16).optional(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_VOTER_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('8h'),
  JWT_EXPIRES_IN: Joi.string().optional(),
  /** Emisor (iss) esperado en tokens de sesión / OIDC (VOTAR-314). */
  JWT_ISSUER: Joi.string().default('https://votar.local/idp'),
  /** Audiencia (aud) esperada en tokens de sesión / OIDC (VOTAR-314). */
  JWT_AUDIENCE: Joi.string().default('votar-api'),
  /**
   * Modos mutuamente excluyentes (VOTAR-314):
   * - Vacío (default / BFF interino): firma RS256 local, publica
   *   GET /auth/.well-known/jwks.json y verifica contra esas claves.
   * - URI remota (SSO IdP): solo verifica tokens del IdP; el BFF no emite
   *   JWT locales incompatibles ni publica JWKS propio.
   */
  JWT_JWKS_URI: Joi.string().uri().allow('').optional(),
  JWT_PRIVATE_KEY: Joi.string().optional(),
  JWT_PUBLIC_KEY: Joi.string().optional(),
  JWT_KID: Joi.string().optional(),
  AUTOGESTION_BASE_URL: Joi.string()
    .uri()
    .default('https://webservice.frvm.utn.edu.ar/autogestion'),
  SEPOLIA_RPC_URL: Joi.string().uri().optional(),
  MERKLE_ROOT_STORE_ADDRESS: Joi.string().optional(),
  MERKLE_UPDATER_PRIVATE_KEY: Joi.string().optional(),
  ELECTION_ADMIN_PRIVATE_KEY: Joi.string().optional(),
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
  /**
   * VOTAR-370 — sal de ofuscación del audit log institucional.
   * Obligatoria en producción (DEVELOPMENT=false) para no hacer predecible
   * el hash de actor/terminal.
   */
  AUDIT_OBFUSCATION_SALT: Joi.when('DEVELOPMENT', {
    is: false,
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().min(8).optional(),
  }),
});
