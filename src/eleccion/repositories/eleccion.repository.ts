import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { IEleccionRepository } from '@/eleccion/interfaces/eleccion.repository.interface';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { mapRolDtoToCategoriaEntity } from '@/eleccion/lista/mappers/categoria.mapper';
import { parseUtcDateTime } from '@/common/utils/parse-utc-datetime.util';

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
}
