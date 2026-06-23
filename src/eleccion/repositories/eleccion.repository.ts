import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { IEleccionRepository } from '@/eleccion/interfaces/eleccion.repository.interface';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { parseUtcDateTime } from '@/common/utils/parse-utc-datetime.util';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';

export type CrearEleccionCompletaResult = {
  eleccion: Eleccion;
  categorias: Categoria[];
  metodosAutenticacion: MetodoAutenticacion[];
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

      await boletaRepo.save(
        boletaRepo.create({
          idEleccion: eleccion.idEleccion,
          titulo: `Boleta — ${dto.nombre}`,
          estado: EstadoBoleta.BORRADOR,
        }),
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
        categorias: [],
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

      const categorias = await categoriaRepo.find({
        where: { idBoleta: boleta.idBoleta },
        order: { orden: 'ASC' },
      });

      return {
        eleccion,
        categorias,
        metodosAutenticacion: dto.metodosAutenticacion,
      };
    });
  }
}
