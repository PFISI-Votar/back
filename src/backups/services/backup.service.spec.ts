import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MailService } from '@/common/mail/mail.service';
import { BACKUP_CHECKSUM_SUFFIX } from '../backup.constants';
import { deriveBackupKey, encryptBackup, sha256Hex } from '../backup.crypto';
import { BackupService } from './backup.service';

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
    const remoteBytes = await readFile(result.remotePath!);
    expect(remoteBytes.length).toBe(result.sizeBytes);
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
