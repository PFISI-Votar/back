import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { VotoConfirmacionEstado } from '@/voto/entities/voto-confirmacion.entity';
import { VotoService } from '@/voto/services/voto.service';

const VOTANTE_HASH = 'a'.repeat(64);
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';

const createQueryBuilderMock = (count = 1) => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(count),
});

const createRepositories = () => {
  const queryBuilder = createQueryBuilderMock();
  return {
    eleccionRepository: {
      findOne: jest.fn().mockResolvedValue({
        idEleccion: 1,
        nombre: 'Comicio UTN',
        estado: EleccionEstado.ABIERTA,
      }),
    },
    configuracionRepository: {
      findOne: jest.fn().mockResolvedValue({
        idEleccion: 1,
        permitirVotoEnBlanco: false,
      }),
    },
    boletaRepository: {
      findOne: jest.fn().mockResolvedValue({
        idBoleta: 10,
        idEleccion: 1,
        titulo: 'Boleta — Comicio UTN',
        estado: EstadoBoleta.PUBLICADA,
        categorias: [
          { idCategoria: 2, nombre: 'Vocales', descripcion: null, orden: 2 },
          { idCategoria: 1, nombre: 'Presidente', descripcion: null, orden: 1 },
        ],
      }),
    },
    listaRepository: {
      find: jest.fn().mockResolvedValue([
        {
          idLista: 20,
          idBoleta: 10,
          nombre: 'Lista B',
          sigla: 'B',
          color: '#2563eb',
          estado: EstadoLista.OFICIALIZADA,
          listId: 2,
          candidatos: [
            {
              idCandidato: 200,
              idCategoria: 1,
              nombre: 'Bruno',
              apellido: 'Barrera',
              orden: 2,
              fotoUrl: null,
            },
          ],
        },
        {
          idLista: 10,
          idBoleta: 10,
          nombre: 'Lista A',
          sigla: 'A',
          color: '#0ea5e9',
          estado: EstadoLista.OFICIALIZADA,
          listId: 1,
          candidatos: [
            {
              idCandidato: 100,
              idCategoria: 1,
              nombre: 'Ana',
              apellido: 'Alvarez',
              orden: 1,
              fotoUrl: null,
            },
            {
              idCandidato: 101,
              idCategoria: 2,
              nombre: 'Valeria',
              apellido: 'Vocal',
              orden: 1,
              fotoUrl: null,
            },
          ],
        },
      ]),
    },
    padronVotanteRepository: {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    },
    votoConfirmacionRepository: {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        (input: Record<string, unknown>): Record<string, unknown> => input,
      ),
      save: jest.fn((input: Record<string, unknown>) =>
        Promise.resolve({
          ...input,
          recibidoEn: new Date('2026-06-22T00:00:00.000Z'),
        }),
      ),
    },
    queryBuilder,
  };
};

const createService = (repositories = createRepositories()) =>
  new VotoService(
    repositories.eleccionRepository as never,
    repositories.configuracionRepository as never,
    repositories.boletaRepository as never,
    repositories.listaRepository as never,
    repositories.padronVotanteRepository as never,
    repositories.votoConfirmacionRepository as never,
  );

describe('VotoService', () => {
  it('devuelve la boleta digital ordenada y con foto nullable', async () => {
    const repositories = createRepositories();
    const service = createService(repositories);

    const actual = await service.obtenerBoletaDigital(1, VOTANTE_HASH);

    expect(actual.categorias.map((categoria) => categoria.nombre)).toEqual([
      'Presidente',
      'Vocales',
    ]);
    expect(
      actual.categorias[0].candidatos.map((candidato) => candidato.listId),
    ).toEqual([1, 2]);
    expect(actual.categorias[0].candidatos[0]).toMatchObject({
      fotoUrl: null,
      nombreCompleto: 'Ana Alvarez',
      agrupacionPolitica: 'Lista A',
      numeroLista: 1,
      colorLista: '#0ea5e9',
    });
  });

  it('permite obtener la boleta con sesión demo sin validar padrón', async () => {
    const repositories = createRepositories();
    repositories.padronVotanteRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilderMock(0),
    );
    const service = createService(repositories);

    await expect(service.obtenerBoletaDigital(1, VOTANTE_HASH)).resolves.toEqual(
      expect.objectContaining({ idEleccion: 1 })
    );
  });

  it('rechaza más de una selección en la misma categoría', async () => {
    const service = createService();

    await expect(
      service.confirmarVoto(
        1,
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          selecciones: [
            { idCategoria: 1, idCandidato: 100 },
            { idCategoria: 1, idCandidato: 200 },
          ],
        },
        VOTANTE_HASH,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('acepta una confirmación válida sin persistir la selección en claro', async () => {
    const repositories = createRepositories();
    const service = createService(repositories);

    const actual = await service.confirmarVoto(
      1,
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        selecciones: [
          { idCategoria: 1, idCandidato: 100 },
          { idCategoria: 2, idCandidato: 101 },
        ],
      },
      VOTANTE_HASH,
    );

    expect(actual.estado).toBe(VotoConfirmacionEstado.RECIBIDO);
    expect(actual.comprobanteHash).toMatch(/^[0-9a-f]{64}$/);
    const [confirmacionPersistida] =
      repositories.votoConfirmacionRepository.save.mock.calls[0];
    expect(confirmacionPersistida).not.toHaveProperty('selecciones');
  });

  it('devuelve el comprobante existente ante el mismo idempotencyKey y payload', async () => {
    const repositories = createRepositories();
    const service = createService(repositories);
    const first = await service.confirmarVoto(
      1,
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        selecciones: [
          { idCategoria: 1, idCandidato: 100 },
          { idCategoria: 2, idCandidato: 101 },
        ],
      },
      VOTANTE_HASH,
    );
    repositories.votoConfirmacionRepository.findOne
      .mockResolvedValueOnce({
        idEleccion: 1,
        votanteHash: VOTANTE_HASH,
        idempotencyKey: IDEMPOTENCY_KEY,
        payloadHash: first.payloadHash,
        comprobanteHash: first.comprobanteHash,
        estado: VotoConfirmacionEstado.RECIBIDO,
        recibidoEn: new Date('2026-06-22T00:00:00.000Z'),
      })
      .mockResolvedValue(null);

    const actual = await service.confirmarVoto(
      1,
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        selecciones: [
          { idCategoria: 2, idCandidato: 101 },
          { idCategoria: 1, idCandidato: 100 },
        ],
      },
      VOTANTE_HASH,
    );

    expect(actual.idempotente).toBe(true);
    expect(actual.comprobanteHash).toBe(first.comprobanteHash);
  });

  it('rechaza reutilizar idempotencyKey con otro payload', async () => {
    const repositories = createRepositories();
    repositories.votoConfirmacionRepository.findOne.mockResolvedValueOnce({
      idEleccion: 1,
      votanteHash: VOTANTE_HASH,
      idempotencyKey: IDEMPOTENCY_KEY,
      payloadHash: 'b'.repeat(64),
    });
    const service = createService(repositories);

    await expect(
      service.confirmarVoto(
        1,
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          selecciones: [
            { idCategoria: 1, idCandidato: 100 },
            { idCategoria: 2, idCandidato: 101 },
          ],
        },
        VOTANTE_HASH,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
