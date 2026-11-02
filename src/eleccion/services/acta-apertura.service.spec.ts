import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActaAperturaService } from '@/eleccion/services/acta-apertura.service';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const onChainMock = {
  estadoOnChain: { codigo: 2, etiqueta: 'ABIERTA' },
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

const ofertaMock = {
  eleccion: {},
  configuracion: {},
  boleta: {},
  categorias: [
    { idCategoria: 1, nombre: 'Presidente' },
    { idCategoria: 2, nombre: 'Vicepresidente' },
  ],
  listas: [
    {
      idLista: 10,
      nombre: 'Lista Celeste',
      sigla: 'LC',
      candidatos: [
        {
          idCandidato: 100,
          nombre: 'Juan',
          apellido: 'Pérez',
          idCategoria: 1,
          orden: 1,
        },
        {
          idCandidato: 101,
          nombre: 'Ana',
          apellido: 'Gómez',
          idCategoria: 2,
          orden: 1,
        },
      ],
    },
  ],
};

const actaAperturaPlantillaMock = {
  incluirDescripcion: true,
  incluirDatosApertura: true,
  incluirResumenPadron: true,
  incluirOfertaElectoral: true,
  incluirVerificacionCriptografica: true,
  incluirLogo: true,
};

const eleccionAbierta = {
  idEleccion: 7,
  nombre: 'Comicio UTN',
  descripcion: 'Elecciones de centro estudiantil',
  estado: EleccionEstado.ABIERTA,
  fechaInicio: new Date('2026-09-01T10:00:00Z'),
  fechaFin: new Date('2026-09-01T18:00:00Z'),
  aperturaModo: 'MANUAL',
  aperturaRealEn: new Date('2026-09-01T10:00:12Z'),
  aperturaActorNombre: 'Ana Gómez',
  aperturaActorRol: 'ELECTION_ADMIN',
};

const createService = (deps?: { eleccion?: unknown }) => {
  const eleccionRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        deps && 'eleccion' in deps ? deps.eleccion : eleccionAbierta,
      ),
  };
  const padronService = {
    obtenerResumenPadron: jest.fn().mockResolvedValue({
      totalVotantesHabilitados: 1500,
      hashPadron: '0xhashpadron',
    }),
  };
  const ofertaElectoralQueryService = {
    obtenerOfertaPublicada: jest.fn().mockResolvedValue(ofertaMock),
  };
  const blockchainService = {
    getContratoEstadoOnChain: jest.fn().mockResolvedValue(onChainMock),
  };
  const configuracionSistemaService = {
    obtener: jest.fn().mockResolvedValue({
      logoUrl: '/uploads/sistema/logo.jpg',
      actaAperturaPlantilla: actaAperturaPlantillaMock,
      actaAperturaModo: 'SIMPLE',
      actaAperturaPlantillaTexto: null,
      fechaActualizacion: '2026-08-01T00:00:00.000Z',
    }),
  };

  return {
    service: new ActaAperturaService(
      eleccionRepository as never,
      padronService as never,
      ofertaElectoralQueryService as never,
      blockchainService as never,
      configuracionSistemaService as never,
    ),
    eleccionRepository,
    padronService,
    ofertaElectoralQueryService,
    blockchainService,
    configuracionSistemaService,
  };
};

describe('ActaAperturaService — VOTAR-374', () => {
  it('compiles padrón, oferta electoral, merkle root and contract addresses (UAT-01)', async () => {
    const { service } = createService();

    const actual = await service.generar(7);

    expect(actual.idEleccion).toBe(7);
    expect(actual.nombreEleccion).toBe('Comicio UTN');
    expect(actual.padron).toEqual({
      totalVotantesHabilitados: 1500,
      hashPadron: '0xhashpadron',
    });
    expect(actual.datosApertura).toEqual({
      modo: 'MANUAL',
      realizadaEn: eleccionAbierta.aperturaRealEn.toISOString(),
      actorNombre: 'Ana Gómez',
      actorRol: 'ELECTION_ADMIN',
    });
    expect(actual.plantilla).toEqual(actaAperturaPlantillaMock);
    expect(actual.formatoPersonalizado).toEqual({
      modo: 'SIMPLE',
      plantillaTexto: null,
    });
    expect(actual.logoUrl).toBe('/uploads/sistema/logo.jpg');
    expect(actual.merkleRoot.hash).toBe(onChainMock.merkleRoot.hash);
    expect(actual.contratos.ballot.direccion).toBe(
      onChainMock.contratos.ballot.direccion,
    );
    expect(actual.red).toBe('Sepolia');
    expect(actual.chainId).toBe(11155111);
    expect(actual.categorias).toHaveLength(2);
    expect(actual.categorias[0]).toEqual({
      idCategoria: 1,
      nombre: 'Presidente',
      candidatos: [
        {
          idCandidato: 100,
          nombreCompleto: 'Pérez, Juan',
          listaNombre: 'Lista Celeste',
          listaSigla: 'LC',
          orden: 1,
        },
      ],
    });
    expect(actual.categorias[1].candidatos).toEqual([
      {
        idCandidato: 101,
        nombreCompleto: 'Gómez, Ana',
        listaNombre: 'Lista Celeste',
        listaSigla: 'LC',
        orden: 1,
      },
    ]);
  });

  it('throws NotFoundException when election is missing', async () => {
    const { service } = createService({ eleccion: null });

    await expect(service.generar(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([EleccionEstado.BORRADOR, EleccionEstado.CONFIGURADA])(
    'throws UnprocessableEntityException when election is %s',
    async (estado) => {
      const { service } = createService({
        eleccion: { ...eleccionAbierta, estado },
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
      eleccion: { ...eleccionAbierta, estado },
    });

    await expect(service.generar(7)).resolves.toBeDefined();
  });
});
