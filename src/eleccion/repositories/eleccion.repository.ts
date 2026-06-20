import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { CrearEleccionValidationException } from '@/eleccion/exceptions/crear-eleccion-validation.exception';
import { IEleccionRepository } from '@/eleccion/interfaces/eleccion.repository.interface';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { mapRolDtoToCategoriaEntity } from '@/eleccion/lista/mappers/categoria.mapper';
import { parseUtcDateTime } from '@/common/utils/parse-utc-datetime.util';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';

export type CrearEleccionCompletaResult = {
  eleccion: Eleccion;
  categorias: Categoria[];
  metodosAutenticacion: MetodoAutenticacion[];
};

type CategoriaUsageRow = {
  idCategoria: string;
  idLista: string;
  count: string;
};

@Injectable()
export class EleccionRepository implements IEleccionRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async crearCompleta(
    dto: CrearEleccionDto,
  ): Promise<CrearEleccionCompletaResult> {
    return this.dataSource.transaction(async (manager) => {
      const eleccionRepo = manager.getRepository(Eleccion);
      const boletaRepo = manager.getRepository(Boleta);
      const categoriaRepo = manager.getRepository(Categoria);
      const configComicioRepo = manager.getRepository(ConfiguracionComicio);
      const configDatosRepo = manager.getRepository(
        ConfiguracionDatosCandidato,
      );

      const eleccion = await eleccionRepo.save(
        eleccionRepo.create({
          nombre: dto.nombre,
          descripcion: dto.descripcion,
          fechaInicio: parseUtcDateTime(dto.fechaInicio),
          fechaFin: parseUtcDateTime(dto.fechaFin),
          estado: EleccionEstado.BORRADOR,
          tipoVotacion: dto.tipoVotacion,
        }),
      );

      const boleta = await boletaRepo.save(
        boletaRepo.create({
          idEleccion: eleccion.idEleccion,
          titulo: `Boleta — ${dto.nombre}`,
          estado: EstadoBoleta.BORRADOR,
        }),
      );

      const categorias = await categoriaRepo.save(
        dto.roles.map((rol, index) =>
          categoriaRepo.create(
            mapRolDtoToCategoriaEntity(rol, boleta.idBoleta, index + 1),
          ),
        ),
      );

      await configComicioRepo.save(
        configComicioRepo.create({
          idEleccion: eleccion.idEleccion,
          metodosAutenticacion: dto.metodosAutenticacion,
          permitirVotoEnBlanco: false,
          permitirVotoMultiple: false,
          maxVotosPorVotante: 1,
          minIntervaloSegundos: 0,
          mostrarResultadosTiempoReal: false,
          politicaRevoto: PoliticaRevoto.DISABLED,
        }),
      );

      await configDatosRepo.save(
        configDatosRepo.create({ idEleccion: eleccion.idEleccion }),
      );

      return {
        eleccion,
        categorias,
        metodosAutenticacion: dto.metodosAutenticacion,
      };
    });
  }

  async actualizarCompleta(
    idEleccion: number,
    dto: ActualizarEleccionDto,
  ): Promise<CrearEleccionCompletaResult> {
    return this.dataSource.transaction(async (manager) => {
      const eleccionRepo = manager.getRepository(Eleccion);
      const boletaRepo = manager.getRepository(Boleta);
      const categoriaRepo = manager.getRepository(Categoria);
      const configComicioRepo = manager.getRepository(ConfiguracionComicio);
      const candidatoRepo = manager.getRepository(Candidato);

      const eleccion = await eleccionRepo.findOne({ where: { idEleccion } });
      if (!eleccion) {
        throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
      }
      assertEleccionEditable(eleccion);

      const boleta = await boletaRepo.findOne({ where: { idEleccion } });
      if (!boleta) {
        throw new NotFoundException(
          `Boleta del comicio ${idEleccion} no encontrada`,
        );
      }

      const config = await configComicioRepo.findOne({
        where: { idEleccion },
      });
      if (!config) {
        throw new NotFoundException(
          `Configuración del comicio ${idEleccion} no encontrada`,
        );
      }

      const existingCategorias = await categoriaRepo.find({
        where: { idBoleta: boleta.idBoleta },
        order: { orden: 'ASC' },
      });

      const usageRows = (await candidatoRepo
        .createQueryBuilder('candidato')
        .innerJoin(Lista, 'lista', 'lista.id_lista = candidato.id_lista')
        .select('candidato.id_categoria', 'idCategoria')
        .addSelect('candidato.id_lista', 'idLista')
        .addSelect('COUNT(*)', 'count')
        .where('lista.id_boleta = :idBoleta', { idBoleta: boleta.idBoleta })
        .groupBy('candidato.id_categoria')
        .addGroupBy('candidato.id_lista')
        .getRawMany()) as CategoriaUsageRow[];

      const maxUsageByCategoria = new Map<number, number>();
      const totalUsageByCategoria = new Map<number, number>();
      for (const row of usageRows) {
        const idCategoria = Number(row.idCategoria);
        const count = Number(row.count);
        const currentMax = maxUsageByCategoria.get(idCategoria) ?? 0;
        if (count > currentMax) {
          maxUsageByCategoria.set(idCategoria, count);
        }
        totalUsageByCategoria.set(
          idCategoria,
          (totalUsageByCategoria.get(idCategoria) ?? 0) + count,
        );
      }

      const payloadCategoriaIds = new Set(
        dto.roles
          .map((rol) => rol.idCategoria)
          .filter((id): id is number => id !== undefined),
      );

      for (const categoria of existingCategorias) {
        if (payloadCategoriaIds.has(categoria.idCategoria)) {
          continue;
        }
        const total = totalUsageByCategoria.get(categoria.idCategoria) ?? 0;
        if (total > 0) {
          throw new CrearEleccionValidationException([
            {
              field: 'roles',
              message: `No se puede eliminar el rol "${categoria.nombre}" porque tiene candidatos registrados`,
            },
          ]);
        }
      }

      eleccion.nombre = dto.nombre;
      eleccion.descripcion = dto.descripcion ?? null;
      eleccion.fechaInicio = parseUtcDateTime(dto.fechaInicio);
      eleccion.fechaFin = parseUtcDateTime(dto.fechaFin);
      eleccion.tipoVotacion = dto.tipoVotacion;
      await eleccionRepo.save(eleccion);

      config.metodosAutenticacion = dto.metodosAutenticacion;
      await configComicioRepo.save(config);

      boleta.titulo = `Boleta — ${dto.nombre}`;
      await boletaRepo.save(boleta);

      const updatedCategorias: Categoria[] = [];
      for (let index = 0; index < dto.roles.length; index += 1) {
        const rol = dto.roles[index];
        const orden = index + 1;
        if (rol.idCategoria !== undefined) {
          const categoria = existingCategorias.find(
            (item) => item.idCategoria === rol.idCategoria,
          );
          if (!categoria || categoria.idBoleta !== boleta.idBoleta) {
            throw new CrearEleccionValidationException([
              {
                field: 'roles',
                message: `El rol con id ${rol.idCategoria} no pertenece a este comicio`,
              },
            ]);
          }
          const maxUsage = maxUsageByCategoria.get(rol.idCategoria) ?? 0;
          if (rol.maximoPostulantes < maxUsage) {
            throw new CrearEleccionValidationException([
              {
                field: 'roles',
                message: `El máximo de postulantes para "${categoria.nombre}" no puede ser menor a ${maxUsage} (candidatos ya registrados en alguna lista)`,
              },
            ]);
          }
          categoria.nombre = rol.nombre;
          categoria.cantidadCargos = rol.maximoPostulantes;
          categoria.orden = orden;
          updatedCategorias.push(await categoriaRepo.save(categoria));
          continue;
        }
        const nuevaCategoria = await categoriaRepo.save(
          categoriaRepo.create(
            mapRolDtoToCategoriaEntity(rol, boleta.idBoleta, orden),
          ),
        );
        updatedCategorias.push(nuevaCategoria);
      }

      for (const categoria of existingCategorias) {
        if (payloadCategoriaIds.has(categoria.idCategoria)) {
          continue;
        }
        await categoriaRepo.remove(categoria);
      }

      return {
        eleccion,
        categorias: updatedCategorias.sort((a, b) => a.orden - b.orden),
        metodosAutenticacion: dto.metodosAutenticacion,
      };
    });
  }
}
