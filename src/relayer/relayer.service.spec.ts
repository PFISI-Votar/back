import { createHash } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { PadronService } from '@/padron/padron.service';
import { RelayCastDto } from '@/relayer/dto/relay-cast.dto';
import { RelayerCapacidad } from '@/relayer/entities/relayer-capacidad.entity';
import { EthersRelayBroadcaster } from '@/relayer/ethers-relay-broadcaster';
import { RelayCastFailedError } from '@/relayer/relay-errors';
import { RelayerService } from '@/relayer/relayer.service';
import { RevotePolicyService } from '@/voto/services/revote-policy.service';

const token = 'ab'.repeat(32);
const tokenHash = createHash('sha256').update(token).digest('hex');
const votanteHash = 'aa'.repeat(32);

const dto = {
  voterLeaf: '0x' + '11'.repeat(32),
  nullifier: '0x' + '22'.repeat(32),
  selectionHash: '0x' + '33'.repeat(32),
  candidateIds: ['101'],
  timestamp: '1700000000',
  expectedSigner: '0x' + '44'.repeat(20),
  signature: '0x' + 'aa'.repeat(65),
  validatorSignature: '0x' + 'bb'.repeat(65),
  merkleProof: ['0x' + '55'.repeat(32)],
  relayToken: token,
} satisfies RelayCastDto;

describe('RelayerService — VOTAR-497', () => {
  const execute = jest.fn();
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute,
  };
  const capacidadRepository = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const padronService = {
    solicitarMerkleProofAutenticada: jest.fn(),
    obtenerProofVotante: jest.fn(),
  };
  const blockchainService = {
    resolveElectionContracts: jest.fn(),
  };
  const broadcaster = {
    castSignedVote: jest.fn(),
  };
  const revotePolicyService = {
    obtenerEstado: jest.fn(),
    registrarConsumo: jest.fn(),
  };
  const auditLogger = {
    logRelayerCapacidadEmitida: jest.fn(),
    logRelayerCastEnviado: jest.fn(),
  };

  let service: RelayerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    queryBuilder.update.mockReturnThis();
    queryBuilder.set.mockReturnThis();
    queryBuilder.where.mockReturnThis();
    queryBuilder.andWhere.mockReturnThis();
    revotePolicyService.obtenerEstado.mockResolvedValue({
      puedeVotar: true,
      intentosRestantes: 1,
    });
    revotePolicyService.registrarConsumo.mockResolvedValue({
      puedeVotar: false,
    });
    auditLogger.logRelayerCapacidadEmitida.mockResolvedValue({});
    auditLogger.logRelayerCastEnviado.mockResolvedValue({});
    const moduleRef = await Test.createTestingModule({
      providers: [
        RelayerService,
        {
          provide: getRepositoryToken(RelayerCapacidad),
          useValue: capacidadRepository,
        },
        { provide: PadronService, useValue: padronService },
        { provide: BlockchainService, useValue: blockchainService },
        { provide: EthersRelayBroadcaster, useValue: broadcaster },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(120_000) },
        },
        { provide: RevotePolicyService, useValue: revotePolicyService },
        { provide: AuditLoggerService, useValue: auditLogger },
      ],
    }).compile();
    service = moduleRef.get(RelayerService);
  });

  it('emite un token opaco y persiste clave_intento (cooldown) sin hoja ni token', async () => {
    padronService.solicitarMerkleProofAutenticada.mockResolvedValue({
      hashHoja: votanteHash,
    });

    const actual = await service.emitirAutorizacion(7, votanteHash);

    expect(actual.relayToken).toMatch(/^[0-9a-f]{64}$/);
    expect(revotePolicyService.obtenerEstado).toHaveBeenCalledWith(
      7,
      votanteHash,
    );
    expect(capacidadRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idEleccion: 7,
        claveIntento: votanteHash,
        tokenHash: createHash('sha256').update(actual.relayToken).digest('hex'),
      }),
    );
    const calls = capacidadRepository.save.mock.calls as Array<
      [Record<string, unknown>]
    >;
    const persisted = calls[0][0];
    expect(persisted).not.toHaveProperty('votanteHash');
    expect(persisted).not.toHaveProperty('hashHoja');
    expect(persisted).not.toHaveProperty('voterLeaf');
    expect(JSON.stringify(persisted)).not.toContain(actual.relayToken);
    expect(auditLogger.logRelayerCapacidadEmitida).toHaveBeenCalledWith({
      idEleccion: 7,
      actorId: votanteHash,
    });
  });

  it('rechaza emisión con 429 cuando el cooldown off-chain está activo', async () => {
    padronService.solicitarMerkleProofAutenticada.mockResolvedValue({
      hashHoja: votanteHash,
    });
    revotePolicyService.obtenerEstado.mockResolvedValue({
      puedeVotar: false,
      proximoReintentoEnSegundos: 42,
    });

    await expect(service.emitirAutorizacion(7, votanteHash)).rejects.toMatchObject(
      {
        status: HttpStatus.TOO_MANY_REQUESTS,
      },
    );
    expect(capacidadRepository.save).not.toHaveBeenCalled();
  });

  it('usa la prueba del padrón y registra consumo tras el cast', async () => {
    execute.mockResolvedValueOnce({ affected: 1 });
    capacidadRepository.findOne.mockResolvedValue({
      tokenHash,
      idEleccion: 7,
      claveIntento: votanteHash,
    });
    padronService.obtenerProofVotante.mockResolvedValue({
      merkleProof: ['0x' + '99'.repeat(32)],
    });
    blockchainService.resolveElectionContracts.mockResolvedValue({
      ballot: '0x' + '01'.repeat(20),
    });
    broadcaster.castSignedVote.mockResolvedValue('0x' + 'f'.repeat(64));

    const actual = await service.transmitir(7, dto);

    expect(padronService.obtenerProofVotante).toHaveBeenCalledWith(
      7,
      '11'.repeat(32),
    );
    expect(broadcaster.castSignedVote).toHaveBeenCalledWith(
      expect.objectContaining({
        electionId: 7,
        merkleProof: ['0x' + '99'.repeat(32)],
        voterLeaf: '0x' + '11'.repeat(32),
      }),
    );
    expect(revotePolicyService.registrarConsumo).toHaveBeenCalledWith(
      7,
      votanteHash,
    );
    expect(auditLogger.logRelayerCastEnviado).toHaveBeenCalledWith({
      idEleccion: 7,
    });
    expect(actual.txHash).toBe('0x' + 'f'.repeat(64));
  });

  it('devuelve txHash aunque registrarConsumo falle tras el cast', async () => {
    execute.mockResolvedValueOnce({ affected: 1 });
    capacidadRepository.findOne.mockResolvedValue({
      claveIntento: votanteHash,
    });
    padronService.obtenerProofVotante.mockResolvedValue({ merkleProof: [] });
    blockchainService.resolveElectionContracts.mockResolvedValue({
      ballot: '0x' + '01'.repeat(20),
    });
    broadcaster.castSignedVote.mockResolvedValue('0x' + 'c'.repeat(64));
    revotePolicyService.registrarConsumo.mockRejectedValue(
      new HttpException(
        { proximoReintentoEnSegundos: 10 },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );

    const actual = await service.transmitir(7, dto);
    expect(actual.txHash).toBe('0x' + 'c'.repeat(64));
  });

  it('libera la capacidad si la simulación falla antes de enviar', async () => {
    execute.mockResolvedValue({ affected: 1 });
    capacidadRepository.findOne.mockResolvedValue({
      claveIntento: votanteHash,
    });
    padronService.obtenerProofVotante.mockResolvedValue({ merkleProof: [] });
    blockchainService.resolveElectionContracts.mockResolvedValue({
      ballot: '0x' + '01'.repeat(20),
    });
    broadcaster.castSignedVote.mockRejectedValue(
      new RelayCastFailedError(
        {
          statusCode: 422,
          code: 'invalid_signature',
          message: 'firma inválida',
          severity: 'error',
          isTransient: false,
          canRetrySend: false,
          canResign: true,
        },
        false,
      ),
    );

    await expect(service.transmitir(7, dto)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(queryBuilder.set).toHaveBeenCalledWith({
      consumidaEn: expect.any(Function) as () => string,
    });
    expect(revotePolicyService.registrarConsumo).not.toHaveBeenCalled();
  });

  it('rechaza un token desconocido sin llamar al nodo', async () => {
    execute.mockResolvedValueOnce({ affected: 0 });

    await expect(service.transmitir(7, dto)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(broadcaster.castSignedVote).not.toHaveBeenCalled();
    expect(tokenHash).toHaveLength(64);
  });
});
