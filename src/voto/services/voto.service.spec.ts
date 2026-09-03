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

const createOfertaMock = () => ({
  eleccion: {
    idEleccion: 1,
    nombre: 'Comicio UTN',
    estado: EleccionEstado.ABIERTA,
    tipoVotacion: TipoVotacion.POR_LISTA,
  },
  configuracion: {
    idEleccion: 1,
    permitirVotoEnBlanco: false,
    permitirVotoNulo: true,
    metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
    mostrarResultadosTiempoReal: false,
  },
  boleta: {
    idBoleta: 10,
    idEleccion: 1,
    titulo: 'Boleta — Comicio UTN',
    estado: EstadoBoleta.PUBLICADA,
  },
  categorias: [
    { idCategoria: 1, nombre: 'Presidente', descripcion: null, orden: 1 },
    { idCategoria: 2, nombre: 'Vocales', descripcion: null, orden: 2 },
  ],
  listas: [
    {
      idLista: 10,
      idBoleta: 10,
      nombre: 'Lista A',
      sigla: 'A',
      color: '#0ea5e9',
      logoUrl: null,
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
    {
      idLista: 20,
      idBoleta: 10,
      nombre: 'Lista B',
      sigla: 'B',
      color: '#2563eb',
      logoUrl: null,
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
  ],
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
        pausada: false,
      }),
    },
    configuracionRepository: {
      findOne: jest.fn().mockResolvedValue({
        idEleccion: 1,
        permitirVotoEnBlanco: false,
        permitirVotoNulo: true,
        metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
        mostrarResultadosTiempoReal: false,
        mostrarDashboardResultados: true,
        mostrarDashboardParticipacion: true,
        mostrarDashboardRevoto: true,
        mostrarDashboardTransacciones: true,
      }),
    },
    padronVotanteRepository: {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    },
    ofertaElectoralQueryService: {
      obtenerOfertaPublicada: jest.fn().mockResolvedValue(createOfertaMock()),
    },
    blockchainService: {
      resolveElectionContracts: jest.fn().mockResolvedValue({
        ballot: '0x9BBDaC872c5781532ec32A9b14B906751d5B8C61',
        voteRegistry: '0xa4b0c8f557d40DDDF6E150C31335a77f9c41Bb4F',
        auditView: '0xe5563E37a547C21f47eDe5A132200246245a16E5',
      }),
    },
    queryBuilder,
  };
};

const createService = (
  repositories = createRepositories(),
  auditLogger = { logVotoEmitido: jest.fn().mockResolvedValue({}) },
  transaccionBlockchainService = {
    registrarVotoPublico: jest.fn().mockResolvedValue(undefined),
  },
) =>
  new VotoService(
    repositories.eleccionRepository as never,
    repositories.configuracionRepository as never,
    repositories.padronVotanteRepository as never,
    repositories.ofertaElectoralQueryService as never,
    auditLogger as never,
    repositories.blockchainService as never,
    transaccionBlockchainService as never,
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
      permitirVotoNulo: true,
      pausada: false,
      visibilidadDashboard: {
        resultados: true,
        participacion: true,
        revoto: true,
        transacciones: true,
      },
    });
  });

  it('VOTAR-447: propaga permitirVotoNulo=false en configuración BUD pública', async () => {
    const repositories = createRepositories();
    repositories.configuracionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      permitirVotoEnBlanco: false,
      permitirVotoNulo: false,
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
      mostrarResultadosTiempoReal: false,
      mostrarDashboardResultados: true,
      mostrarDashboardParticipacion: true,
      mostrarDashboardRevoto: true,
      mostrarDashboardTransacciones: true,
    });
    const service = createService(repositories);

    const actual = await service.obtenerConfiguracionBud(1);

    expect(actual.permitirVotoNulo).toBe(false);
  });

  it('VOTAR-459: oculta las secciones del dashboard según configuración mientras el comicio está ABIERTA', async () => {
    const repositories = createRepositories();
    repositories.configuracionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      permitirVotoEnBlanco: false,
      permitirVotoNulo: true,
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
      mostrarResultadosTiempoReal: false,
      mostrarDashboardResultados: false,
      mostrarDashboardParticipacion: false,
      mostrarDashboardRevoto: true,
      mostrarDashboardTransacciones: true,
    });
    const service = createService(repositories);

    const actual = await service.obtenerConfiguracionBud(1);

    expect(actual.visibilidadDashboard).toEqual({
      resultados: false,
      participacion: false,
      revoto: true,
      transacciones: true,
    });
  });

  it('VOTAR-459: ignora los flags y muestra todas las secciones cuando el comicio ya cerró', async () => {
    const repositories = createRepositories();
    repositories.eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      nombre: 'Comicio UTN',
      estado: EleccionEstado.CERRADA,
      tipoVotacion: TipoVotacion.POR_LISTA,
      pausada: false,
    });
    repositories.configuracionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      permitirVotoEnBlanco: false,
      permitirVotoNulo: true,
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
      mostrarResultadosTiempoReal: false,
      mostrarDashboardResultados: false,
      mostrarDashboardParticipacion: false,
      mostrarDashboardRevoto: false,
      mostrarDashboardTransacciones: false,
    });
    const service = createService(repositories);

    const actual = await service.obtenerConfiguracionBud(1);

    expect(actual.visibilidadDashboard).toEqual({
      resultados: true,
      participacion: true,
      revoto: true,
      transacciones: true,
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

    expect(actual.permitirVotoNulo).toBe(true);
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

  it('VOTAR-373: registra transacción pública tras validación on-chain', async () => {
    const transaccionBlockchainService = {
      registrarVotoPublico: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService(
      createRepositories(),
      { logVotoEmitido: jest.fn() },
      transaccionBlockchainService,
    );
    const txHash = '0x' + 'cd'.repeat(32);

    const actual = await service.registrarTransaccionPublica(1, txHash);

    expect(actual).toEqual({ registrado: true, idEleccion: 1 });
    expect(
      transaccionBlockchainService.registrarVotoPublico,
    ).toHaveBeenCalledWith(1, txHash);
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

  describe('obtenerOfertaPublica — VOTAR-368', () => {
    it('UAT-01: devuelve categorías ordenadas con candidatos oficializados sin autenticación', async () => {
      const repositories = createRepositories();
      const service = createService(repositories);

      const actual = await service.obtenerOfertaPublica(1);

      expect(actual.categorias.map((categoria) => categoria.nombre)).toEqual([
        'Presidente',
        'Vocales',
      ]);
      expect(
        actual.categorias[0].candidatos.map((candidato) => ({
          nombreCompleto: candidato.nombreCompleto,
          agrupacionPolitica: candidato.agrupacionPolitica,
          numeroLista: candidato.numeroLista,
        })),
      ).toEqual([
        {
          nombreCompleto: 'Ana Alvarez',
          agrupacionPolitica: 'Lista A',
          numeroLista: 1,
        },
        {
          nombreCompleto: 'Bruno Barrera',
          agrupacionPolitica: 'Lista B',
          numeroLista: 2,
        },
      ]);
      expect(
        repositories.padronVotanteRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });

    it('UAT-02: incluye nombreCompleto, fotoUrl y agrupacionPolitica', async () => {
      const repositories = createRepositories();
      repositories.ofertaElectoralQueryService.obtenerOfertaPublicada.mockResolvedValue(
        {
          ...createOfertaMock(),
          listas: [
            {
              idLista: 10,
              idBoleta: 10,
              nombre: 'Lista A',
              sigla: 'A',
              color: '#0ea5e9',
              logoUrl: '/uploads/listas/a.png',
              estado: EstadoLista.OFICIALIZADA,
              listId: 1,
              candidatos: [
                {
                  idCandidato: 100,
                  idCategoria: 1,
                  nombre: 'Ana',
                  apellido: 'Alvarez',
                  orden: 1,
                  fotoUrl: '/uploads/candidatos/ana.jpg',
                },
              ],
            },
          ],
        },
      );
      const service = createService(repositories);

      const actual = await service.obtenerOfertaPublica(1);

      expect(actual.categorias[0].candidatos[0]).toMatchObject({
        nombreCompleto: 'Ana Alvarez',
        agrupacionPolitica: 'Lista A',
        fotoUrl: '/uploads/candidatos/ana.jpg',
        logoListaUrl: '/uploads/listas/a.png',
      });
    });

    it('lanza NotFoundException si la boleta aún no está PUBLICADA', async () => {
      const repositories = createRepositories();
      repositories.ofertaElectoralQueryService.obtenerOfertaPublicada.mockRejectedValue(
        new NotFoundException('La oferta electoral aún no fue oficializada'),
      );
      const service = createService(repositories);

      await expect(service.obtenerOfertaPublica(1)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.obtenerOfertaPublica(1)).rejects.toThrow(
        'La oferta electoral aún no fue oficializada',
      );
    });

    it('permite consultar la oferta con comicio CERRADA', async () => {
      const repositories = createRepositories();
      repositories.ofertaElectoralQueryService.obtenerOfertaPublicada.mockResolvedValue(
        {
          ...createOfertaMock(),
          eleccion: {
            ...createOfertaMock().eleccion,
            estado: EleccionEstado.CERRADA,
          },
        },
      );
      const service = createService(repositories);

      const actual = await service.obtenerOfertaPublica(1);

      expect(actual.estadoEleccion).toBe(EleccionEstado.CERRADA);
      expect(actual.categorias).toHaveLength(2);
    });

    it('permite consultar la oferta con comicio ESCRUTADA', async () => {
      const repositories = createRepositories();
      repositories.ofertaElectoralQueryService.obtenerOfertaPublicada.mockResolvedValue(
        {
          ...createOfertaMock(),
          eleccion: {
            ...createOfertaMock().eleccion,
            estado: EleccionEstado.ESCRUTADA,
          },
        },
      );
      const service = createService(repositories);

      const actual = await service.obtenerOfertaPublica(1);

      expect(actual.estadoEleccion).toBe(EleccionEstado.ESCRUTADA);
    });

    it('lanza NotFoundException si el comicio no existe', async () => {
      const repositories = createRepositories();
      repositories.ofertaElectoralQueryService.obtenerOfertaPublicada.mockRejectedValue(
        new NotFoundException('Elección 99 no encontrada'),
      );
      const service = createService(repositories);

      await expect(service.obtenerOfertaPublica(99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
