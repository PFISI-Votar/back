import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActaCierreService } from '@/eleccion/services/acta-cierre.service';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const onChainMock = {
  estadoOnChain: { codigo: 3, etiqueta: 'CERRADA' },
  merkleRoot: {
    hash: '0x' + 'ab'.repeat(32),
    publicado: true,
    publicadoEn: '2026-08-08T12:00:00.000Z',
  },
  revoto: {
    habilitado: false,
    maxVotosPorVotante: 1,
    minIntervaloSegundos: 0,
    politicaRevoto: 'DISABLED' as const,
  },
  contratos: {
    ballot: {
      direccion: '0x1111111111111111111111111111111111111111',
      explorerUrl: 'https://sepolia.etherscan.io/address/0x1111',
    },
    voteRegistry: {
      direccion: '0x2222222222222222222222222222222222222222',
      explorerUrl: 'https://sepolia.etherscan.io/address/0x2222',
    },
    auditView: {
      direccion: '0x3333333333333333333333333333333333333333',
      explorerUrl: 'https://sepolia.etherscan.io/address/0x3333',
    },
    merkleRootStore: {
      direccion: '0x4444444444444444444444444444444444444444',
      explorerUrl: 'https://sepolia.etherscan.io/address/0x4444',
    },
  },
  red: 'Sepolia',
  chainId: 11155111,
};

const escrutinioMock = {
  idEleccion: 7,
  nombre: 'Comicio UTN',
  estado: EleccionEstado.CERRADA,
  tipoVotacion: 'UNICA_LISTA',
  congelado: true,
  fuente: 'ON_CHAIN' as const,
  actualizadoEn: '2026-09-01T18:00:00.000Z',
  participacion: {
    totalVotos: 120,
    votosBlanco: 5,
    votosNulo: 2,
    totalVotantesHabilitados: 1500,
    porcentajeParticipacion: 8.0,
  },
  candidatos: [
    {
      idCandidato: 100,
      nombre: 'Juan',
      apellido: 'Pérez',
      idLista: 10,
      nombreLista: 'Lista Celeste',
      siglaLista: 'LC',
      colorLista: '#2f6f9f',
      idCategoria: 1,
      nombreCategoria: 'Presidente',
      votos: 60,
      porcentaje: 52.2,
    },
  ],
};

const actaCierrePlantillaMock = {
  incluirDescripcion: true,
  incluirParticipacion: true,
  incluirResultadosPorLista: true,
  incluirVerificacionCriptografica: true,
  incluirLogo: true,
};

const eleccionCerrada = {
  idEleccion: 7,
  nombre: 'Comicio UTN',
  descripcion: 'Elecciones de centro estudiantil',
  estado: EleccionEstado.CERRADA,
  tipoVotacion: 'UNICA_LISTA',
  fechaInicio: new Date('2026-09-01T10:00:00Z'),
  fechaFin: new Date('2026-09-01T18:00:00Z'),
};

const createService = (deps?: { eleccion?: unknown }) => {
  const eleccionRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        deps && 'eleccion' in deps ? deps.eleccion : eleccionCerrada,
      ),
  };
  const escrutinioService = {
    obtenerResultados: jest.fn().mockResolvedValue(escrutinioMock),
  };
  const blockchainService = {
    getContratoEstadoOnChain: jest.fn().mockResolvedValue(onChainMock),
  };
  const configuracionSistemaService = {
    obtener: jest.fn().mockResolvedValue({
      logoUrl: '/uploads/sistema/logo.jpg',
      actaCierrePlantilla: actaCierrePlantillaMock,
      actaCierreModo: 'SIMPLE',
      actaCierrePlantillaTexto: null,
      fechaActualizacion: '2026-08-01T00:00:00.000Z',
    }),
  };

  return {
    service: new ActaCierreService(
      eleccionRepository as never,
      escrutinioService as never,
      blockchainService as never,
      configuracionSistemaService as never,
    ),
    eleccionRepository,
    escrutinioService,
    blockchainService,
    configuracionSistemaService,
  };
};

describe('ActaCierreService', () => {
  it('compiles escrutinio totals, contract addresses and formato (UAT-01)', async () => {
    const { service } = createService();

    const actual = await service.generar(7);

    expect(actual.idEleccion).toBe(7);
    expect(actual.nombreEleccion).toBe('Comicio UTN');
    expect(actual.participacion).toEqual(escrutinioMock.participacion);
    expect(actual.candidatos).toEqual(escrutinioMock.candidatos);
    expect(actual.plantilla).toEqual(actaCierrePlantillaMock);
    expect(actual.formatoPersonalizado).toEqual({
      modo: 'SIMPLE',
      plantillaTexto: null,
    });
    expect(actual.logoUrl).toBe('/uploads/sistema/logo.jpg');
    expect(actual.merkleRoot.hash).toBe(onChainMock.merkleRoot.hash);
    expect(actual.contratos.auditView.direccion).toBe(
      onChainMock.contratos.auditView.direccion,
    );
    expect(actual.red).toBe('Sepolia');
    expect(actual.chainId).toBe(11155111);
  });

  it('throws NotFoundException when election is missing', async () => {
    const { service } = createService({ eleccion: null });

    await expect(service.generar(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    EleccionEstado.BORRADOR,
    EleccionEstado.CONFIGURADA,
    EleccionEstado.ABIERTA,
  ])(
    'throws UnprocessableEntityException when election is %s',
    async (estado) => {
      const { service } = createService({
        eleccion: { ...eleccionCerrada, estado },
      });

      await expect(service.generar(7)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    },
  );

  it.each([
    EleccionEstado.CERRADA,
    EleccionEstado.ESCRUTADA,
    EleccionEstado.ARCHIVADA,
  ])('allows re-generating the acta when election is %s', async (estado) => {
    const { service } = createService({
      eleccion: { ...eleccionCerrada, estado },
    });

    await expect(service.generar(7)).resolves.toBeDefined();
  });
});
