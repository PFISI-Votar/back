import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DEVELOPMENT: Joi.boolean().truthy('true').falsy('false').default(false),
  REQUIRE_HTTPS: Joi.boolean().truthy('true').falsy('false').default(false),
  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  /** VOTAR-380 — whitelist CORS (comma-separated). Falls back to FRONTEND_URL when empty. */
  CORS_ALLOWED_ORIGINS: Joi.string().allow('').optional(),
  /** VOTAR-380 — rate limit tiers (in-memory, per IP). */
  RATE_LIMIT_AUTH_MAX: Joi.number().integer().min(1).default(10),
  RATE_LIMIT_AUTH_WINDOW_MS: Joi.number().integer().min(100).default(1000),
  RATE_LIMIT_VOTE_MAX: Joi.number().integer().min(1).default(5),
  RATE_LIMIT_VOTE_WINDOW_MS: Joi.number().integer().min(1000).default(60_000),
  RATE_LIMIT_PUBLIC_MAX: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_PUBLIC_WINDOW_MS: Joi.number().integer().min(1000).default(60_000),
  RATE_LIMIT_GLOBAL_MAX: Joi.number().integer().min(1).default(120),
  RATE_LIMIT_GLOBAL_WINDOW_MS: Joi.number().integer().min(1000).default(60_000),
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  LOAD_BLOCKCHAIN_LOCAL: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),

  /**
   * @deprecated Usar RS256 + JWKS (VOTAR-314).
   * Los access tokens ya no se firman ni verifican con este secret.
   * Mantenido como opcional para no romper entornos que aún lo tengan seteado.
   * Remover en cuanto se confirme que ningún deploy activo lo referencia.
   *
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
  /** VOTAR-386 — extra Infura/Alchemy/QuickNode URLs, comma-separated. */
  SEPOLIA_RPC_FALLBACK_URLS: Joi.string().allow('').optional(),
  RPC_FAILOVER_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(15_000)
    .default(800),
  RPC_MAX_BLOCK_SKEW: Joi.number().integer().min(0).max(64).default(5),
  MERKLE_ROOT_STORE_ADDRESS: Joi.string().optional(),

  PRIVATE_KEY: Joi.string().optional(),
  ADMIN_MULTISIG_ADDRESS: Joi.string().optional(),
  PAUSER_OPERATOR_ADDRESS: Joi.string().optional(),
  /** VOTAR-347 — confirmaciones de autoridades PAUSER distintas requeridas antes de emitir la tx. */
  PAUSE_CONFIRMATIONS_REQUIRED: Joi.number().integer().min(1).default(2),
  BALLOT_CONTRACT_ADDRESS: Joi.string().optional(),
  /** Env-first AuditView/VoteRegistry override read by resolveContractsFromEnv (VOTAR-365). */
  AUDIT_VIEW_CONTRACT_ADDRESS: Joi.string().optional(),
  VOTE_REGISTRY_CONTRACT_ADDRESS: Joi.string().optional(),
  BLOCKCHAIN_NETWORK_NAME: Joi.string().optional(),

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
  /** VOTAR-387 — habilita el scheduler de aprovisionamiento de gas. Default false para evitar que cada instancia local dispare contra el Faucet Maestro compartido. */
  FAUCET_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  /** VOTAR-387 — private key del Faucet Maestro (aprovisionamiento de gas de test). */
  FAUCET_MASTER_PRIVATE_KEY: Joi.string().optional(),
});
