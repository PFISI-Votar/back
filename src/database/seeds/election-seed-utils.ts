import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import dataSource from '@/database/data-source';
import {
  ElectoralImageKind,
  IMAGE_CONFIG,
  PUBLIC_IMAGE_ROOT,
  optimizarImagenElectoral,
} from '@/common/images/electoral-image.service';
import { ImagenElectoral } from '@/common/images/entities/imagen-electoral.entity';
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

const escapeSvgText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const getInitials = (nombreCompleto: string): string => {
  const parts = nombreCompleto.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';

  return `${first}${last}`.toUpperCase();
};

const buildListLogoSvg = (seedList: SeedList): string => {
  const color = seedList.color || '#2563eb';

  return `
<svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="400" rx="48" fill="${escapeSvgText(color)}"/>
  <circle cx="120" cy="120" r="70" fill="rgba(255,255,255,0.16)"/>
  <circle cx="690" cy="315" r="110" fill="rgba(255,255,255,0.12)"/>
  <text x="400" y="185" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="700" fill="#ffffff">${escapeSvgText(seedList.sigla)}</text>
  <text x="400" y="255" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="500" fill="#ffffff">${escapeSvgText(seedList.nombre)}</text>
</svg>`;
};

const buildCandidatePhotoSvg = (
  seedList: SeedList,
  seedCandidate: SeedCandidate,
): string => {
  const color = seedList.color || '#2563eb';

  return `
<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="${escapeSvgText(color)}"/>
  <circle cx="200" cy="150" r="72" fill="rgba(255,255,255,0.24)"/>
  <rect x="80" y="245" width="240" height="130" rx="65" fill="rgba(255,255,255,0.18)"/>
  <text x="200" y="178" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" fill="#ffffff">${escapeSvgText(getInitials(seedCandidate.nombreCompleto))}</text>
  <text x="200" y="335" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" fill="#ffffff">${escapeSvgText(seedCandidate.rol)}</text>
</svg>`;
};

/**
 * VOTAR-466 — persiste una imagen de seed en `imagen_electoral` usando el
 * mismo pipeline de optimización que un upload real (WebP + presupuesto),
 * así los datos sembrados son indistinguibles de los que sube un usuario.
 * Idempotente por checksum: si el SVG (determinista) ya generó una fila
 * idéntica en una corrida anterior del seed, se reutiliza en vez de
 * duplicar bytes — reemplaza el `fs.access() -> return` que tenía
 * `ensureGeneratedJpeg` contra el disco.
 */
const ensureSeedImage = async (
  manager: EntityManager,
  tipo: ElectoralImageKind,
  svg: string,
): Promise<string> => {
  const { data, info } = await optimizarImagenElectoral(
    Buffer.from(svg),
    IMAGE_CONFIG[tipo],
  );
  const checksumSha256 = createHash('sha256').update(data).digest('hex');

  const existente = await manager.findOne(ImagenElectoral, {
    where: { checksumSha256 },
  });
  if (existente) {
    return `${PUBLIC_IMAGE_ROOT}/${existente.idImagen}`;
  }

  const guardada = await manager.save(
    manager.create(ImagenElectoral, {
      tipo,
      mimeType: 'image/webp',
      contenido: data,
      tamanoBytes: data.length,
      checksumSha256,
      ancho: info.width,
      alto: info.height,
    }),
  );

  return `${PUBLIC_IMAGE_ROOT}/${guardada.idImagen}`;
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
      permitirVotoNulo: true,
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
    const logoUrl = await ensureSeedImage(
      manager,
      'lista-logo',
      buildListLogoSvg(seedList),
    );
    const lista = await manager.save(
      manager.create(Lista, {
        idBoleta: boleta.idBoleta,
        nombre: seedList.nombre,
        sigla: seedList.sigla,
        color: seedList.color,
        logoUrl,
        fechaOficializacion: null,
        estado: EstadoLista.BORRADOR,
        listId: index + 1,
      }),
    );

    for (const [
      candidateIndex,
      seedCandidate,
    ] of seedList.candidatos.entries()) {
      const categoria = categorias.get(seedCandidate.rol);
      if (!categoria) {
        throw new Error(
          `Categoría no encontrada para rol ${seedCandidate.rol}`,
        );
      }

      const fotoUrl = await ensureSeedImage(
        manager,
        'candidato-foto',
        buildCandidatePhotoSvg(seedList, seedCandidate),
      );
      await manager.save(
        manager.create(Candidato, {
          idLista: lista.idLista,
          idCategoria: categoria.idCategoria,
          ...splitNombreCompleto(seedCandidate.nombreCompleto),
          orden: candidateIndex + 1,
          fotoUrl,
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
