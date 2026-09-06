import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MailService } from '@/common/mail/mail.service';
import {
  BACKUP_CHECKSUM_SUFFIX,
  BACKUP_FILE_SUFFIX,
  BACKUP_RETENTION_DAYS_DEFAULT,
  DEFAULT_BACKUP_DIR,
} from '../backup.constants';
import {
  decryptBackup,
  deriveBackupKey,
  encryptBackup,
  looksEncrypted,
  sha256Hex,
} from '../backup.crypto';
import { selectExpiredBackups } from '../backup.retention';

export interface BackupResult {
  encryptedPath: string;
  checksumPath: string;
  remotePath: string | null;
  sizeBytes: number;
  sha256: string;
  pruned: string[];
}

export interface RestoreResult {
  plainDumpPath: string;
  restoredDatabase: string;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  getBackupDir(): string {
    const configured = this.configService.get<string>('BACKUP_DIR');
    return configured?.trim() ? resolve(configured.trim()) : DEFAULT_BACKUP_DIR;
  }

  private getRetentionDays(): number {
    const raw = this.configService.get<number>('BACKUP_RETENTION_DAYS');
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
      return Math.floor(raw);
    }
    return BACKUP_RETENTION_DAYS_DEFAULT;
  }

  private requireEncryptionKey(): Buffer {
    const secret = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
    if (!secret?.trim()) {
      throw new ServiceUnavailableException(
        'Respaldo no configurado (BACKUP_ENCRYPTION_KEY).',
      );
    }
    return deriveBackupKey(secret);
  }

  private buildDumpEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PGPASSWORD: this.configService.get<string>('DB_PASSWORD') ?? '',
    };
  }

  private buildTimestampSlug(now: Date = new Date()): string {
    return now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
  }

  /**
   * Ejecuta pg_dump (formato custom) hacia un archivo temporal.
   * Inyectable vía override en tests reemplazando este método.
   */
  async runPgDump(outputPath: string): Promise<void> {
    const host = this.configService.get<string>('DB_HOST') ?? 'localhost';
    const port = String(this.configService.get<number>('DB_PORT') ?? 5432);
    const user = this.configService.get<string>('DB_USERNAME') ?? 'postgres';
    const database = this.configService.get<string>('DB_NAME') ?? 'votar';

    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        'pg_dump',
        [
          '-h',
          host,
          '-p',
          port,
          '-U',
          user,
          '-d',
          database,
          '-F',
          'c',
          '-f',
          outputPath,
        ],
        {
          env: this.buildDumpEnv(),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        reject(
          new Error(
            `No se pudo ejecutar pg_dump (${error.message}). ¿Está instalado el cliente PostgreSQL?`,
          ),
        );
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        reject(
          new Error(
            `pg_dump falló con código ${code ?? 'null'}: ${stderr.trim() || 'sin detalle'}`,
          ),
        );
      });
    });
  }

  /**
   * Restaura un dump en formato custom con pg_restore --clean --if-exists.
   */
  async runPgRestore(dumpPath: string, database: string): Promise<void> {
    const host = this.configService.get<string>('DB_HOST') ?? 'localhost';
    const port = String(this.configService.get<number>('DB_PORT') ?? 5432);
    const user = this.configService.get<string>('DB_USERNAME') ?? 'postgres';

    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        'pg_restore',
        [
          '-h',
          host,
          '-p',
          port,
          '-U',
          user,
          '-d',
          database,
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-acl',
          dumpPath,
        ],
        {
          env: this.buildDumpEnv(),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        reject(
          new Error(
            `No se pudo ejecutar pg_restore (${error.message}). ¿Está instalado el cliente PostgreSQL?`,
          ),
        );
      });

      child.on('close', (code) => {
        // pg_restore puede devolver 1 con warnings no fatales; solo 0 es éxito limpio.
        // Códigos >= 2 son errores reales.
        if (code === 0 || code === 1) {
          if (code === 1 && stderr.trim()) {
            this.logger.warn(
              `pg_restore finalizó con warnings: ${stderr.trim()}`,
            );
          }
          resolvePromise();
          return;
        }
        reject(
          new Error(
            `pg_restore falló con código ${code ?? 'null'}: ${stderr.trim() || 'sin detalle'}`,
          ),
        );
      });
    });
  }

  async assertIntegrity(encryptedPath: string): Promise<string> {
    const payload = await readFile(encryptedPath);
    if (!looksEncrypted(payload)) {
      throw new Error(
        `El archivo ${encryptedPath} no tiene el formato cifrado VOTAR esperado.`,
      );
    }
    const actual = sha256Hex(payload);
    const checksumPath = `${encryptedPath}${BACKUP_CHECKSUM_SUFFIX}`;
    const expected = (await readFile(checksumPath, 'utf8')).trim();
    if (actual !== expected) {
      throw new Error(
        `Checksum inválido para ${encryptedPath}: esperado ${expected}, obtenido ${actual}.`,
      );
    }
    return actual;
  }

  async pruneExpiredBackups(backupDir: string): Promise<string[]> {
    const retentionDays = this.getRetentionDays();
    const entries = await readdir(backupDir);
    const metas = await Promise.all(
      entries
        .filter((name) => name.endsWith(BACKUP_FILE_SUFFIX))
        .map(async (name) => {
          const info = await stat(join(backupDir, name));
          return { name, mtimeMs: info.mtimeMs };
        }),
    );

    const expired = selectExpiredBackups(metas, retentionDays);
    for (const name of expired) {
      const encPath = join(backupDir, name);
      const checksumPath = `${encPath}${BACKUP_CHECKSUM_SUFFIX}`;
      await unlink(encPath).catch(() => undefined);
      await unlink(checksumPath).catch(() => undefined);
      this.logger.log(
        `Respaldo expirado eliminado (>${retentionDays}d): ${name}`,
      );
    }
    return expired;
  }

  private async copyToRemote(
    encryptedPath: string,
    checksumPath: string,
  ): Promise<string | null> {
    const remoteDir = this.configService
      .get<string>('BACKUP_REMOTE_DIR')
      ?.trim();
    if (!remoteDir) {
      return null;
    }
    await mkdir(remoteDir, { recursive: true });
    const remoteEnc = join(remoteDir, encryptedPath.split(/[/\\]/).pop()!);
    const remoteChecksum = `${remoteEnc}${BACKUP_CHECKSUM_SUFFIX}`;
    await copyFile(encryptedPath, remoteEnc);
    await copyFile(checksumPath, remoteChecksum);
    this.logger.log(`Respaldo copiado a ubicación remota: ${remoteEnc}`);
    return remoteEnc;
  }

  private async notifyFailure(error: unknown): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Error desconocido en backup';
    this.logger.error(`Fallo de respaldo PostgreSQL: ${message}`);

    const to = this.configService.get<string>('ALERT_EMAIL_TO')?.trim();
    if (!to) {
      this.logger.warn(
        'ALERT_EMAIL_TO no configurado: no se envió alerta de fallo de backup.',
      );
      return;
    }

    const sent = await this.mailService.sendMail({
      to,
      subject: '[VOTAR] Alerta crítica: fallo de respaldo PostgreSQL',
      text: [
        'El proceso automatizado de respaldo de PostgreSQL falló.',
        '',
        `Detalle: ${message}`,
        `Momento: ${new Date().toISOString()}`,
        '',
        'Revisar logs del backend / cron y espacio en disco (VOTAR-388 / UAT-03).',
      ].join('\n'),
    });

    if (!sent) {
      this.logger.error(
        'No se pudo enviar la alerta de fallo de backup por mail.',
      );
    }
  }

  /**
   * Volcado completo → cifrado AES-256-GCM → checksum → retención → remoto opcional.
   */
  async runBackup(): Promise<BackupResult> {
    const backupDir = this.getBackupDir();
    const key = this.requireEncryptionKey();
    const slug = this.buildTimestampSlug();
    const dbName = this.configService.get<string>('DB_NAME') ?? 'votar';
    const plainPath = join(backupDir, `.tmp-${slug}.dump`);
    const encryptedPath = join(
      backupDir,
      `${dbName}-${slug}${BACKUP_FILE_SUFFIX}`,
    );
    const checksumPath = `${encryptedPath}${BACKUP_CHECKSUM_SUFFIX}`;

    try {
      await mkdir(backupDir, { recursive: true });
      this.logger.log(`Iniciando pg_dump hacia ${plainPath}`);
      await this.runPgDump(plainPath);

      const plain = await readFile(plainPath);
      if (plain.length === 0) {
        throw new Error(
          'El volcado generado está vacío (posible fallo de disco o permisos).',
        );
      }

      const encrypted = encryptBackup(plain, key);
      await writeFile(encryptedPath, encrypted);

      const digest = sha256Hex(encrypted);
      await writeFile(checksumPath, `${digest}\n`, 'utf8');
      await this.assertIntegrity(encryptedPath);

      const remotePath = await this.copyToRemote(encryptedPath, checksumPath);
      const pruned = await this.pruneExpiredBackups(backupDir);

      const result: BackupResult = {
        encryptedPath,
        checksumPath,
        remotePath,
        sizeBytes: encrypted.length,
        sha256: digest,
        pruned,
      };
      this.logger.log(
        `Respaldo OK: ${encryptedPath} (${encrypted.length} bytes, sha256=${digest.slice(0, 12)}…)`,
      );
      return result;
    } catch (error) {
      await this.notifyFailure(error);
      throw error;
    } finally {
      await rm(plainPath, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Descifra un respaldo, valida integridad y restaura en la BD indicada
   * (por defecto BACKUP_RESTORE_DB o `<DB_NAME>_restore`).
   */
  async restoreBackup(
    encryptedPath: string,
    targetDatabase?: string,
  ): Promise<RestoreResult> {
    const key = this.requireEncryptionKey();
    await this.assertIntegrity(encryptedPath);

    const encrypted = await readFile(encryptedPath);
    const plain = decryptBackup(encrypted, key);
    const backupDir = this.getBackupDir();
    await mkdir(backupDir, { recursive: true });

    const plainDumpPath = join(
      backupDir,
      `.restore-${this.buildTimestampSlug()}.dump`,
    );
    await writeFile(plainDumpPath, plain);

    const database =
      targetDatabase?.trim() ||
      this.configService.get<string>('BACKUP_RESTORE_DB')?.trim() ||
      `${this.configService.get<string>('DB_NAME') ?? 'votar'}_restore`;

    try {
      this.logger.log(`Restaurando ${encryptedPath} → BD ${database}`);
      await this.runPgRestore(plainDumpPath, database);
      return { plainDumpPath, restoredDatabase: database };
    } finally {
      await rm(plainDumpPath, { force: true }).catch(() => undefined);
    }
  }
}
