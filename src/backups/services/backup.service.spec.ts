import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MailService } from '@/common/mail/mail.service';
import { BACKUP_CHECKSUM_SUFFIX } from '../backup.constants';
import { deriveBackupKey, encryptBackup, sha256Hex } from '../backup.crypto';
import { BackupService } from './backup.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

describe('BackupService (VOTAR-388)', () => {
  let service: BackupService;
  let backupDir: string;
  const sendMail = jest.fn().mockResolvedValue(true);

  const encryptionKey = 'unit-test-backup-encryption-key';
  const configValues: Record<string, string | number | boolean> = {
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'votar',
    BACKUP_ENCRYPTION_KEY: encryptionKey,
    BACKUP_RETENTION_DAYS: 30,
    ALERT_EMAIL_TO: 'autoridad@utn.edu.ar',
    DEVELOPMENT: true,
  };

  beforeEach(async () => {
    backupDir = await mkdtemp(join(tmpdir(), 'votar-backup-'));
    configValues['BACKUP_DIR'] = backupDir;
    sendMail.mockReset();
    sendMail.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
        {
          provide: MailService,
          useValue: { sendMail },
        },
      ],
    }).compile();

    service = module.get(BackupService);
  });

  afterEach(async () => {
    delete configValues['BACKUP_REMOTE_DIR'];
    await rm(backupDir, { recursive: true, force: true });
  });

  it('genera dump cifrado + checksum y no deja el plain en disco', async () => {
    const fakeDump = Buffer.from('FAKE-PG-DUMP-CONTENT');
    jest
      .spyOn(service, 'runPgDump')
      .mockImplementation(async (outputPath: string) => {
        await writeFile(outputPath, fakeDump);
      });

    const result = await service.runBackup();

    expect(result.encryptedPath.endsWith('.dump.enc')).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(fakeDump.length);
    expect(result.sha256).toHaveLength(64);
    expect(result.pruned).toEqual([]);

    const onDisk = await readFile(result.encryptedPath);
    expect(onDisk.includes(fakeDump)).toBe(false);

    const checksum = (await readFile(result.checksumPath, 'utf8')).trim();
    expect(checksum).toBe(result.sha256);
    expect(sha256Hex(onDisk)).toBe(checksum);

    await expect(service.assertIntegrity(result.encryptedPath)).resolves.toBe(
      checksum,
    );
  });

  it('copia a BACKUP_REMOTE_DIR cuando está configurado', async () => {
    const remoteDir = join(backupDir, 'remote');
    configValues['BACKUP_REMOTE_DIR'] = remoteDir;
    jest
      .spyOn(service, 'runPgDump')
      .mockImplementation(async (outputPath: string) => {
        await writeFile(outputPath, Buffer.from('dump'));
      });

    const result = await service.runBackup();
    expect(result.remotePath).toBeTruthy();
    expect(result.prunedRemote).toEqual([]);
    const remoteBytes = await readFile(result.remotePath!);
    expect(remoteBytes.length).toBe(result.sizeBytes);
  });

  it('depura respaldos remotos con más de 30 días (VOTAR-513)', async () => {
    const remoteDir = join(backupDir, 'remote');
    configValues['BACKUP_REMOTE_DIR'] = remoteDir;
    await mkdir(remoteDir, { recursive: true });
    const old = join(remoteDir, 'votar-old.dump.enc');
    await writeFile(old, 'x');
    await writeFile(`${old}${BACKUP_CHECKSUM_SUFFIX}`, 'x');
    const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await utimes(old, past, past);
    jest
      .spyOn(service, 'runPgDump')
      .mockImplementation(async (outputPath: string) => {
        await writeFile(outputPath, Buffer.from('dump'));
      });

    const result = await service.runBackup();

    expect(result.prunedRemote).toEqual(['votar-old.dump.enc']);
    await expect(stat(old)).rejects.toThrow();
    await expect(stat(`${old}${BACKUP_CHECKSUM_SUFFIX}`)).rejects.toThrow();
    await expect(stat(result.remotePath!)).resolves.toBeDefined();
  });

  describe('retención remota (VOTAR-513)', () => {
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let remoteDir: string;

    beforeEach(() => {
      remoteDir = join(backupDir, 'remote');
      configValues['BACKUP_REMOTE_DIR'] = remoteDir;
      jest
        .spyOn(service, 'runPgDump')
        .mockImplementation(async (outputPath: string) => {
          await writeFile(outputPath, Buffer.from('dump'));
        });
    });

    it('conserva respaldos remotos con menos de 30 días', async () => {
      await mkdir(remoteDir, { recursive: true });
      const recent = join(remoteDir, 'votar-recent.dump.enc');
      await writeFile(recent, 'x');
      await utimes(recent, daysAgo(29), daysAgo(29));

      const result = await service.runBackup();

      expect(result.prunedRemote).toEqual([]);
      await expect(stat(recent)).resolves.toBeDefined();
    });

    it('no toca respaldos remotos de otra base', async () => {
      await mkdir(remoteDir, { recursive: true });
      const foreign = join(remoteDir, 'otra_base-old.dump.enc');
      await writeFile(foreign, 'x');
      await utimes(foreign, daysAgo(40), daysAgo(40));

      const result = await service.runBackup();

      expect(result.prunedRemote).toEqual([]);
      await expect(stat(foreign)).resolves.toBeDefined();
    });

    it('tolera que el directorio remoto no exista', async () => {
      await expect(service.pruneExpiredBackups(remoteDir)).resolves.toEqual([]);
    });

    it('no informa como eliminado un respaldo que no se pudo borrar', async () => {
      await mkdir(remoteDir, { recursive: true });
      // unlink sobre un directorio falla con EISDIR/EPERM (≠ ENOENT).
      const stuck = join(remoteDir, 'votar-stuck.dump.enc');
      await mkdir(stuck);
      await utimes(stuck, daysAgo(31), daysAgo(31));
      const warn = jest
        .spyOn(
          (service as unknown as { logger: { warn: () => void } }).logger,
          'warn',
        )
        .mockImplementation(() => undefined);

      const result = await service.runBackup();

      expect(result.prunedRemote).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('No se pudo eliminar') as string,
      );
    });

    it('un fallo de la poda remota no falla el respaldo y avisa aparte', async () => {
      const original = BackupService.prototype.pruneExpiredBackups.bind(
        service,
      ) as BackupService['pruneExpiredBackups'];
      jest
        .spyOn(service, 'pruneExpiredBackups')
        .mockImplementation((dir: string, prefix?: string) =>
          dir === remoteDir
            ? Promise.reject(new Error('EACCES: permission denied'))
            : original(dir, prefix),
        );

      const result = await service.runBackup();

      expect(result.encryptedPath.endsWith('.dump.enc')).toBe(true);
      expect(result.prunedRemote).toEqual([]);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('depuración') as string,
          text: expect.stringContaining('EACCES') as string,
        }),
      );
    });
  });

  it('pasa -Z 6 a pg_dump (compresión explícita)', async () => {
    const child = Object.assign(new EventEmitter(), {
      stderr: new EventEmitter(),
    });
    const spawnMock = spawn as unknown as jest.Mock<
      unknown,
      [string, string[]]
    >;
    spawnMock.mockImplementationOnce(() => {
      setImmediate(() => child.emit('close', 0));
      return child;
    });

    await service.runPgDump(join(backupDir, 'out.dump'));

    const [command, args] = spawnMock.mock.calls[0];
    expect(command).toBe('pg_dump');
    expect(args.slice(args.indexOf('-F'), args.indexOf('-F') + 4)).toEqual([
      '-F',
      'c',
      '-Z',
      '6',
    ]);
  });

  it('notifica por mail cuando el backup falla (UAT-03)', async () => {
    jest
      .spyOn(service, 'runPgDump')
      .mockRejectedValue(new Error('ENOSPC: no space left on device'));

    await expect(service.runBackup()).rejects.toThrow(/ENOSPC/);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'autoridad@utn.edu.ar',
        subject: expect.stringContaining('fallo de respaldo') as string,
        text: expect.stringContaining('ENOSPC') as string,
      }),
    );
  });

  it('detecta inconsistencias de checksum', async () => {
    const key = deriveBackupKey(encryptionKey);
    const enc = encryptBackup(Buffer.from('x'), key);
    const encPath = join(backupDir, 'broken.dump.enc');
    await mkdir(backupDir, { recursive: true });
    await writeFile(encPath, enc);
    await writeFile(`${encPath}${BACKUP_CHECKSUM_SUFFIX}`, '0'.repeat(64));

    await expect(service.assertIntegrity(encPath)).rejects.toThrow(
      /Checksum inválido/,
    );
  });

  it('descifra y restaura validando integridad (UAT-01)', async () => {
    const key = deriveBackupKey(encryptionKey);
    const plain = Buffer.from('RESTORE-DUMP');
    const enc = encryptBackup(plain, key);
    const encPath = join(backupDir, 'restore-me.dump.enc');
    await writeFile(encPath, enc);
    await writeFile(
      `${encPath}${BACKUP_CHECKSUM_SUFFIX}`,
      `${sha256Hex(enc)}\n`,
    );

    const restoreSpy = jest
      .spyOn(service, 'runPgRestore')
      .mockResolvedValue(undefined);

    const result = await service.restoreBackup(encPath, 'votar_restore');
    expect(result.restoredDatabase).toBe('votar_restore');
    expect(restoreSpy).toHaveBeenCalledWith(
      expect.stringContaining('.restore-'),
      'votar_restore',
    );
  });
});
