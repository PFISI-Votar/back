import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidatoDatosValidatorService } from './candidato-datos-validator.service';
import { CandidatoService } from './candidato.service';
import { ConfiguracionDatosCandidatoService } from './configuracion-datos-candidato.service';
import { BoletaService } from './boleta.service';
import { Eleccion } from './entities/eleccion.entity';
import { Boleta } from './entities/boleta.entity';
import { Categoria } from './entities/categoria.entity';
import { Lista } from './entities/lista.entity';
import { Candidato } from './entities/candidato.entity';
import { ConfiguracionDatosCandidato } from './entities/configuracion-datos-candidato.entity';
import { EleccionesController } from './eleccion.controller';
import { EleccionesService } from './eleccion.service';
import { ELECCION_REPOSITORY } from './interfaces/eleccion.repository.interface';
import { EleccionRepository } from './eleccion.repository';
import { ListaController } from './lista.controller';
import { ListaService } from './lista.service';
import { OficializacionService } from './oficializacion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Eleccion,
      Boleta,
      Categoria,
      Lista,
      Candidato,
      ConfiguracionDatosCandidato,
    ]),
  ],
  controllers: [EleccionesController, ListaController],
  providers: [
    EleccionesService,
    BoletaService,
    ListaService,
    CandidatoService,
    CandidatoDatosValidatorService,
    ConfiguracionDatosCandidatoService,
    OficializacionService,
    {
      provide: ELECCION_REPOSITORY,
      useClass: EleccionRepository,
    },
  ],
})
export class EleccionesModule {}
