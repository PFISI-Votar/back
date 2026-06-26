import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Eleccion } from '../eleccion/entities/eleccion.entity';
import { PadronElectoral } from './entities/padron-electoral.entity';
import { PadronVotante } from './entities/padron-votante.entity';
import { PadronController } from './padron.controller';
import { PadronService } from './padron.service';
import { PadronRepository } from './padron.repository';
import { PADRON_REPOSITORY } from './interfaces/padron.repository.interface';
import { PadronEligibilityService } from './services/padron-eligibility.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PadronElectoral, PadronVotante, Eleccion]),
  ],
  controllers: [PadronController],
  providers: [
    PadronService,
    PadronEligibilityService,
    {
      provide: PADRON_REPOSITORY,
      useClass: PadronRepository,
    },
  ],
  exports: [PadronEligibilityService],
})
export class PadronModule {}
