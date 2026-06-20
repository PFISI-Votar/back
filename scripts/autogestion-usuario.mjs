#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const BASE_URL = 'https://webservice.frvm.utn.edu.ar/autogestion';
const USER_AGENT = 'votar-back-autogestion-script/1.0';

const promptHidden = (query) =>
  new Promise((resolve) => {
    stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let password = '';
    const onData = (char) => {
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          stdout.write('\n');
          process.exit(130);
          break;
        case '\u007f':
        case '\b':
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write('\b \b');
          }
          break;
        default:
          if (char >= ' ') {
            password += char;
            stdout.write('*');
          }
          break;
      }
    };
    stdin.on('data', onData);
  });

const promptCredentials = async () => {
  const rl = createInterface({ input: stdin, output: stdout });
  const nick = await rl.question('Usuario de autogestión: ');
  rl.close();
  const password = stdin.isTTY
    ? await promptHidden('Contraseña de autogestión: ')
    : await (async () => {
        const rlPassword = createInterface({ input: stdin, output: stdout });
        try {
          return await rlPassword.question('Contraseña de autogestión: ');
        } finally {
          rlPassword.close();
        }
      })();
  return { nick: nick.trim(), password: password.trim() };
};

const login = async (nick, password) => {
  const response = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'User-Agent': USER_AGENT,
      nick,
      password,
    },
  });
  if (!response.ok) {
    throw new Error(`Login falló (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  if (!data.hashActual) {
    throw new Error('Login exitoso pero no se recibió hashActual');
  }
  return data.hashActual;
};

const fetchUsuario = async (nick, hash) => {
  const auth = Buffer.from(`${nick}:${hash}`).toString('base64');
  const response = await fetch(`${BASE_URL}/usuarios`, {
    headers: {
      Accept: '*/*',
      'User-Agent': USER_AGENT,
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

const main = async () => {
  const { nick, password } = await promptCredentials();
  if (!nick || !password) {
    console.error('Usuario y contraseña son obligatorios.');
    process.exit(1);
  }
  const hash = await login(nick, password);
  const usuario = await fetchUsuario(nick, hash);
  if (!usuario.persona) {
    console.error('No se encontraron datos de persona para este usuario.');
    process.exit(1);
  }
  console.log(JSON.stringify(usuario.persona, null, 2));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
