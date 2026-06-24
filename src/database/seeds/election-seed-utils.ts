import { DataSource, EntityManager } from 'typeorm';
import dataSource from '@/database/data-source';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';

export type SeedCandidate = {
  nombreCompleto: string;
  rol: string;
};

export type SeedList = {
  nombre: string;
  sigla: string;
  color: string;
  candidatos: SeedCandidate[];
};

export type ElectionSeedDefinition = {
  nombre: string;
  descripcion: string;
  tituloBoleta: string;
  listas: SeedList[];
};

type SeedContext = {
  eleccion: Eleccion;
  boleta: Boleta;
  categorias: Map<string, Categoria>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const getFutureDateRange = () => {
  const now = new Date();
  const fechaInicio = new Date(now.getTime() + 30 * DAY_MS);
  fechaInicio.setUTCHours(11, 0, 0, 0);
  const fechaFin = new Date(fechaInicio.getTime() + 10 * 60 * 60 * 1000);

  return { fechaInicio, fechaFin };
};

export const splitNombreCompleto = (nombreCompleto: string) => {
  const parts = nombreCompleto.trim().split(/\s+/);
  const apellido = parts.pop() ?? nombreCompleto;
  const nombre = parts.join(' ') || apellido;

  return { nombre, apellido };
};

export const seedElection = async (
  definition: ElectionSeedDefinition,
  manager: EntityManager,
): Promise<SeedContext> => {
  await manager.delete(Eleccion, { nombre: definition.nombre });

  const { fechaInicio, fechaFin } = getFutureDateRange();
  const eleccion = await manager.save(
    manager.create(Eleccion, {
      nombre: definition.nombre,
      descripcion: definition.descripcion,
      fechaInicio,
      fechaFin,
      estado: EleccionEstado.BORRADOR,
      tipoVotacion: TipoVotacion.POR_LISTA,
      minimoCandidatosPorLista: null,
    }),
  );

  await manager.save(
    manager.create(ConfiguracionComicio, {
      idEleccion: eleccion.idEleccion,
      permitirVotoEnBlanco: true,
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      minIntervaloSegundos: 0,
      mostrarResultadosTiempoReal: false,
      duracionMinutos: null,
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
      politicaRevoto: PoliticaRevoto.DISABLED,
    }),
  );

  const boleta = await manager.save(
    manager.create(Boleta, {
      idEleccion: eleccion.idEleccion,
      titulo: definition.tituloBoleta,
      fechaPublicacion: null,
      estado: EstadoBoleta.BORRADOR,
    }),
  );

  const roles = Array.from(
    new Set(
      definition.listas.flatMap((lista) =>
        lista.candidatos.map((candidato) => candidato.rol),
      ),
    ),
  );

  const categorias = new Map<string, Categoria>();
  for (const [index, rol] of roles.entries()) {
    const cantidadCargos = Math.max(
      ...definition.listas.map(
        (lista) =>
          lista.candidatos.filter((candidato) => candidato.rol === rol).length,
      ),
      1,
    );
    const categoria = await manager.save(
      manager.create(Categoria, {
        idBoleta: boleta.idBoleta,
        nombre: rol,
        descripcion: `Candidatos a ${rol}`,
        cantidadCargos,
        minimoPostulantes: 1,
        orden: index + 1,
      }),
    );
    categorias.set(rol, categoria);
  }

  for (const [index, seedList] of definition.listas.entries()) {
    const lista = await manager.save(
      manager.create(Lista, {
        idBoleta: boleta.idBoleta,
        nombre: seedList.nombre,
        sigla: seedList.sigla,
        color: seedList.color,
        logoUrl: null,
        fechaOficializacion: null,
        estado: EstadoLista.BORRADOR,
        listId: index + 1,
      }),
    );

    for (const [candidateIndex, seedCandidate] of seedList.candidatos.entries()) {
      const categoria = categorias.get(seedCandidate.rol);
      if (!categoria) {
        throw new Error(`Categoría no encontrada para rol ${seedCandidate.rol}`);
      }

      await manager.save(
        manager.create(Candidato, {
          idLista: lista.idLista,
          idCategoria: categoria.idCategoria,
          ...splitNombreCompleto(seedCandidate.nombreCompleto),
          orden: candidateIndex + 1,
          fotoUrl: null,
          datosAdicionales: {},
        }),
      );
    }
  }

  return { eleccion, boleta, categorias };
};

export const runSeed = async (
  label: string,
  seed: (manager: EntityManager) => Promise<void>,
  source: DataSource = dataSource,
) => {
  await source.initialize();
  try {
    await source.transaction(seed);
    console.log(`Seed completado: ${label}`);
  } finally {
    await source.destroy();
  }
};
