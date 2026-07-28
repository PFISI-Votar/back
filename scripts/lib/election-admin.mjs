import pg from 'pg';

const { Client } = pg;

const getDbConfig = () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'votar',
});

const getAutogestionBaseUrl = () =>
  process.env.AUTOGESTION_BASE_URL ??
  'https://webservice.frvm.utn.edu.ar/autogestion';

const loginAutogestion = async (nick, password) => {
  const baseUrl = getAutogestionBaseUrl();
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      nick,
      password,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Login falló (${response.status}): ${await response.text()}`,
    );
  }
  const data = await response.json();
  if (!data.hashActual) {
    throw new Error('Login exitoso pero no se recibió hashActual');
  }
  return data.hashActual;
};

const fetchAutogestionUsuario = async (nick, hash) => {
  const baseUrl = getAutogestionBaseUrl();
  const auth = Buffer.from(`${nick}:${hash}`).toString('base64');
  const response = await fetch(`${baseUrl}/usuarios`, {
    headers: {
      Accept: '*/*',
      nick,
      Authorization: `Basic ${auth}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Consulta de usuario falló (${response.status}): ${await response.text()}`,
    );
  }
  return response.json();
};

const resolvePersonaFields = (nick, persona) => {
  const nombre = [persona.nombre, persona.apellido].filter(Boolean).join(' ');
  const email = persona.email ?? persona.mail;
  if (!email) {
    throw new Error(
      'Autogestión no devolvió email para este usuario; no se puede registrar la autoridad.',
    );
  }
  return {
    identificadorSso: nick,
    email,
    nombre: nombre || nick,
  };
};

export const countElectionAdmins = async () => {
  const client = new Client(getDbConfig());
  await client.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM autoridad_electoral WHERE rol = 'ELECTION_ADMIN'`,
    );
    return result.rows[0]?.count ?? 0;
  } finally {
    await client.end();
  }
};

export const removePlaceholderAdmin = async () => {
  const client = new Client(getDbConfig());
  await client.connect();
  try {
    await client.query(
      `
        DELETE FROM autoridad_electoral
        WHERE identificador_sso = 'votar.admin'
          AND email = 'admin@votar.local'
      `,
    );
  } finally {
    await client.end();
  }
};

export const upsertElectionAdmin = async (autoridad) => {
  const client = new Client(getDbConfig());
  await client.connect();
  try {
    const result = await client.query(
      `
        INSERT INTO autoridad_electoral (
          identificador_sso,
          email,
          nombre,
          rol
        ) VALUES ($1, $2, $3, 'ELECTION_ADMIN')
        ON CONFLICT (identificador_sso) DO UPDATE SET
          email = EXCLUDED.email,
          nombre = EXCLUDED.nombre,
          rol = 'ELECTION_ADMIN'
        RETURNING
          id_autoridad,
          identificador_sso,
          email,
          nombre,
          rol
      `,
      [
        autoridad.identificadorSso,
        autoridad.email,
        autoridad.nombre,
      ],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
};

/**
 * Validates UTN credentials via Autogestión and upserts ELECTION_ADMIN in the DB.
 */
export const registerElectionAdmin = async (nick, password) => {
  const trimmedNick = nick.trim();
  const trimmedPassword = password.trim();
  if (!trimmedNick || !trimmedPassword) {
    throw new Error('Usuario y contraseña son obligatorios.');
  }

  const hash = await loginAutogestion(trimmedNick, trimmedPassword);
  const usuario = await fetchAutogestionUsuario(trimmedNick, hash);
  if (!usuario.persona) {
    throw new Error('No se encontraron datos de persona para este usuario.');
  }

  const autoridad = resolvePersonaFields(trimmedNick, usuario.persona);
  return upsertElectionAdmin(autoridad);
};
