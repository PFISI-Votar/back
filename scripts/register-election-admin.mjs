#!/usr/bin/env node
import { config } from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { registerElectionAdmin } from './lib/election-admin.mjs';

config();

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
  const nick = await rl.question('Usuario: ');
  rl.close();
  const password = stdin.isTTY
    ? await promptHidden('Contraseña: ')
    : await (async () => {
        const rlPassword = createInterface({ input: stdin, output: stdout });
        try {
          return await rlPassword.question('Contraseña: ');
        } finally {
          rlPassword.close();
        }
      })();
  return { nick: nick.trim(), password: password.trim() };
};

const supportsColor = stdout.isTTY;

const style = {
  bold: (text) => (supportsColor ? `\x1b[1m${text}\x1b[0m` : text),
  dim: (text) => (supportsColor ? `\x1b[2m${text}\x1b[0m` : text),
  green: (text) => (supportsColor ? `\x1b[32m${text}\x1b[0m` : text),
  cyan: (text) => (supportsColor ? `\x1b[36m${text}\x1b[0m` : text),
};

const formatRol = (rol) => {
  if (rol === 'ELECTION_ADMIN') {
    return 'Administrador electoral';
  }
  return rol;
};

const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');

const padLine = (text, width) => {
  const visible = stripAnsi(text);
  const padding = Math.max(0, width - visible.length);
  return text + ' '.repeat(padding);
};

const printRegisteredAdmin = (autoridad) => {
  const fields = [
    ['Usuario', autoridad.identificador_sso],
    ['Nombre', autoridad.nombre],
    ['Email', autoridad.email],
    ['Rol', formatRol(autoridad.rol)],
  ];
  const labelWidth = Math.max(...fields.map(([label]) => label.length));
  const cardLines = fields.map(
    ([label, value]) =>
      `  ${style.dim(`${label.padEnd(labelWidth)}`)}  ${style.bold(value)}`,
  );
  const innerWidth = Math.max(
    ...cardLines.map((line) => stripAnsi(line).length),
    stripAnsi('  Credenciales validadas correctamente').length,
  );
  const border = (left, fill, right) =>
    left + fill.repeat(innerWidth + 2) + right;

  console.log('');
  console.log(style.green(border('╭', '─', '╮')));
  console.log(
    style.green('│') +
      padLine(
        `  ${style.green('✓')}  ${style.bold('Autoridad electoral habilitada')}`,
        innerWidth,
      ) +
      style.green('│'),
  );
  console.log(style.green(border('╰', '─', '╯')));
  console.log('');
  console.log(`  ${style.cyan(`Hola, ${autoridad.nombre}`)}`);
  console.log('');
  console.log(
    '  Tu cuenta quedó registrada en VOTAR con privilegios de administración.',
  );
  console.log(
    '  Podés iniciar sesión en el Panel de Gestión con el mismo usuario y contraseña.',
  );
  console.log('');
  console.log(style.dim(border('┌', '─', '┐')));
  for (const line of cardLines) {
    console.log(style.dim('│') + padLine(line, innerWidth) + style.dim('│'));
  }
  console.log(style.dim(border('└', '─', '┘')));
  console.log('');
  console.log(
    style.dim(
      `  ID interno: ${autoridad.id_autoridad}  ·  VOTAR Panel de Gestión`,
    ),
  );
  console.log('');
};

const main = async () => {
  const { nick, password } = await promptCredentials();
  const saved = await registerElectionAdmin(nick, password);
  printRegisteredAdmin(saved);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
