import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { EleccionesModule } from '../eleccion/eleccion.module';
import { Eleccion } from '../eleccion/entities/eleccion.entity';
import { MerkleTree } from './entities/merkle-tree.entity';
import { PadronElectoral } from './entities/padron-electoral.entity';
import { PadronVotante } from './entities/padron-votante.entity';
import { PadronController } from './controllers/padron.controller';
import { PadronService } from './padron.service';
import { PadronRepository } from './padron.repository';
import { PADRON_REPOSITORY } from './interfaces/padron.repository.interface';
import { PadronEligibilityService } from './services/padron-eligibility.service';
import { MerkleBuilderService } from './services/merkle-builder.service';
import { PadronPublicController } from './controllers/padron-public.controller';

@Module({
  imports: [
    BlockchainModule,
    forwardRef(() => EleccionesModule),
    TypeOrmModule.forFeature([
      PadronElectoral,
      PadronVotante,
      MerkleTree,
      Eleccion,
    ]),
  ],
  controllers: [PadronController, PadronPublicController],
  providers: [
    PadronService,
    MerkleBuilderService,
    PadronEligibilityService,
    {
      provide: PADRON_REPOSITORY,
      useClass: PadronRepository,
    },
  ],
  exports: [PadronEligibilityService, PadronService],
})
export class PadronModule {}
