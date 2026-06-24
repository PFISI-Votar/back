import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DEVELOPMENT: Joi.boolean().truthy('true').falsy('false').default(false),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  AUTOGESTION_BASE_URL: Joi.string()
    .uri()
    .default('https://webservice.frvm.utn.edu.ar/autogestion'),
  ELECTION_ADMIN_SEED_NICK: Joi.string().optional(),
});
