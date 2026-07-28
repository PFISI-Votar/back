import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidatoController } from '@/eleccion/candidato/controllers/candidato.controller';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CandidatoDatosValidatorService } from '@/eleccion/candidato/services/candidato-datos-validator.service';
import { CandidatoService } from '@/eleccion/candidato/services/candidato.service';
import { ConfiguracionDatosCandidatoService } from '@/eleccion/candidato/services/configuracion-datos-candidato.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ListaModule } from '@/eleccion/lista/lista.module';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { ElectoralImageService } from '@/common/images/electoral-image.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Eleccion,
      Categoria,
      Candidato,
      ConfiguracionDatosCandidato,
      CampoDatosCandidato,
    ]),
    ListaModule,
  ],
  controllers: [CandidatoController],
  providers: [
    CandidatoService,
    ConfiguracionDatosCandidatoService,
    CandidatoDatosValidatorService,
    ElectoralImageService,
  ],
  exports: [ConfiguracionDatosCandidatoService, CandidatoService],
})
export class CandidatoModule {}
