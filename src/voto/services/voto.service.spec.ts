import {
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { VotoService } from '@/voto/services/voto.service';

const VOTANTE_HASH = 'a'.repeat(64);

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
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    },
    configuracionRepository: {
      findOne: jest.fn().mockResolvedValue({
        idEleccion: 1,
        permitirVotoEnBlanco: false,
        metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
        mostrarResultadosTiempoReal: false,
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
    queryBuilder,
  };
};

const createService = (
  repositories = createRepositories(),
  auditLogger = { logVotoEmitido: jest.fn().mockResolvedValue({}) },
) =>
  new VotoService(
    repositories.eleccionRepository as never,
    repositories.configuracionRepository as never,
    repositories.boletaRepository as never,
    repositories.listaRepository as never,
    repositories.padronVotanteRepository as never,
    auditLogger as never,
  );

describe('VotoService', () => {
  it('devuelve la configuración pública de la BUD sin autenticación', async () => {
    const service = createService();

    const actual = await service.obtenerConfiguracionBud(1);

    expect(actual).toEqual({
      idEleccion: 1,
      nombre: 'Comicio UTN',
      estado: EleccionEstado.ABIERTA,
      tipoVotacion: TipoVotacion.POR_LISTA,
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
      resultadosDefinitivos: false,
      snapshotCongelado: true,
    });
  });

  it('lanza NotFoundException si el comicio no existe al obtener configuración BUD', async () => {
    const repositories = createRepositories();
    repositories.eleccionRepository.findOne.mockResolvedValue(null);
    const service = createService(repositories);

    await expect(service.obtenerConfiguracionBud(99)).rejects.toThrow(
      NotFoundException,
    );
  });

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

  it('rechaza la boleta cuando el votante no está habilitado en el padrón', async () => {
    const repositories = createRepositories();
    repositories.padronVotanteRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilderMock(0),
    );
    const service = createService(repositories);

    await expect(service.obtenerBoletaDigital(1, VOTANTE_HASH)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('UAT-05: registra VOTO_EMITIDO anónimo sin identidad ni payload de voto', async () => {
    const auditLogger = { logVotoEmitido: jest.fn().mockResolvedValue({}) };
    const service = createService(createRepositories(), auditLogger);

    const actual = await service.registrarVotoEmitidoAnonimo(1);

    expect(actual).toEqual({ registrado: true, idEleccion: 1 });
    expect(auditLogger.logVotoEmitido).toHaveBeenCalledWith({
      idEleccion: 1,
      endpoint: 'POST /elecciones/1/votos/emitido-anonimo',
    });
  });

  it('UAT-05: rechaza registro anónimo si el comicio no existe', async () => {
    const repositories = createRepositories();
    repositories.eleccionRepository.findOne.mockResolvedValue(null);
    const service = createService(repositories);

    await expect(service.registrarVotoEmitidoAnonimo(99)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('UAT-05: rechaza registro anónimo en BORRADOR', async () => {
    const repositories = createRepositories();
    repositories.eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    const service = createService(repositories);

    await expect(service.registrarVotoEmitidoAnonimo(1)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('VOTAR-321: responde HTTP 410 cuando el comicio está CERRADA', async () => {
    const repositories = createRepositories();
    repositories.eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.CERRADA,
    });
    const service = createService(repositories);

    await expect(service.registrarVotoEmitidoAnonimo(1)).rejects.toThrow(
      GoneException,
    );
  });
});
