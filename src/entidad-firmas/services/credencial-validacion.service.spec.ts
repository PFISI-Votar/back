import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { keccak256 } from 'ethers';
import { DataSource } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import {
  CredencialValidacion,
  EstadoCredencialValidacion,
} from '@/entidad-firmas/entities/credencial-validacion.entity';
import { EmisionCredencial } from '@/entidad-firmas/entities/emision-credencial.entity';
import { CredencialValidacionService } from '@/entidad-firmas/services/credencial-validacion.service';
import { PadronEligibilityService } from '@/padron/services/padron-eligibility.service';

describe('CredencialValidacionService (VOTAR-377)', () => {
  const ID_ELECCION = 377;
  const VOTANTE_HASH = 'a'.repeat(64);
  const SECRETO = `0x${'1'.repeat(64)}`;
  const COMMIT = keccak256(SECRETO).toLowerCase();

  let service: CredencialValidacionService;

  const credencialRepository = {
    findOne: jest.fn(),
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
  };
  const emisionRepository = {
    findOne: jest.fn(),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    insert: jest.fn(() => Promise.resolve({ identifiers: [] })),
  };
  const eleccionRepository = { findOne: jest.fn() };
  const configuracionRepository = { findOne: jest.fn() };
  const padronEligibilityService = { isVotanteHabilitado: jest.fn() };
  const configService = { get: jest.fn(() => 900_000) };
  const auditLogger = { logCredencialValidacionEmitida: jest.fn() };

  const updateExecute = jest.fn();
  const chainableUpdateBuilder: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'execute' ? updateExecute : () => chainableUpdateBuilder,
    },
  );
  const dataSource = {
    createQueryBuilder: jest.fn(() => chainableUpdateBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: ID_ELECCION,
      estado: EleccionEstado.ABIERTA,
    });
    padronEligibilityService.isVotanteHabilitado.mockResolvedValue(true);
    configuracionRepository.findOne.mockResolvedValue({
      maxVotosPorVotante: 1,
    });
    credencialRepository.findOne.mockResolvedValue(null);
    emisionRepository.findOne.mockResolvedValue(null);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CredencialValidacionService,
        {
          provide: getRepositoryToken(CredencialValidacion),
          useValue: credencialRepository,
        },
        {
          provide: getRepositoryToken(EmisionCredencial),
          useValue: emisionRepository,
        },
        { provide: getRepositoryToken(Eleccion), useValue: eleccionRepository },
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: configuracionRepository,
        },
        {
          provide: PadronEligibilityService,
          useValue: padronEligibilityService,
        },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditLoggerService, useValue: auditLogger },
      ],
    }).compile();
    service = moduleRef.get(CredencialValidacionService);
  });

  describe('emitir', () => {
    it('registra la credencial y audita cuando el votante pertenece al padrón', async () => {
      const actual = await service.emitir(ID_ELECCION, VOTANTE_HASH, COMMIT);

      expect(credencialRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          commitCredencial: COMMIT,
          estado: EstadoCredencialValidacion.EMITIDA,
        }),
      );
      expect(auditLogger.logCredencialValidacionEmitida).toHaveBeenCalledWith(
        expect.objectContaining({
          idEleccion: ID_ELECCION,
          actorId: VOTANTE_HASH,
        }),
      );
      expect(actual.expiraEn.getTime() % (5 * 60 * 1000)).toBe(0);
    });

    it('rechaza si el comicio no está ABIERTA', async () => {
      eleccionRepository.findOne.mockResolvedValue({
        idEleccion: ID_ELECCION,
        estado: EleccionEstado.CERRADA,
      });
      await expect(
        service.emitir(ID_ELECCION, VOTANTE_HASH, COMMIT),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza si el votante no está en el padrón', async () => {
      padronEligibilityService.isVotanteHabilitado.mockResolvedValue(false);
      await expect(
        service.emitir(ID_ELECCION, VOTANTE_HASH, COMMIT),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza cuando el comicio no existe', async () => {
      eleccionRepository.findOne.mockResolvedValue(null);
      await expect(
        service.emitir(ID_ELECCION, VOTANTE_HASH, COMMIT),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza cuando se supera el tope de credenciales por votante', async () => {
      emisionRepository.findOne.mockResolvedValue({ credencialesEmitidas: 3 });
      await expect(
        service.emitir(ID_ELECCION, VOTANTE_HASH, COMMIT),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('consumir', () => {
    it('consume la credencial con un UPDATE condicional atómico', async () => {
      updateExecute.mockResolvedValue({ affected: 1 });
      await expect(
        service.consumir(ID_ELECCION, SECRETO),
      ).resolves.toBeUndefined();
    });

    it('lanza 410 si la credencial es inexistente / vencida / ya usada (sin oráculo)', async () => {
      updateExecute.mockResolvedValue({ affected: 0 });
      await expect(
        service.consumir(ID_ELECCION, SECRETO),
      ).rejects.toBeInstanceOf(GoneException);
    });
  });
});
