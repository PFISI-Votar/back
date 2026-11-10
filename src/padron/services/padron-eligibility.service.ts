import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { CriterioHashPadron } from '@/padron/enums/criterio-hash-padron.enum';

@Injectable()
export class PadronEligibilityService {
  constructor(
    @InjectRepository(PadronVotante)
    private readonly padronVotanteRepository: Repository<PadronVotante>,
    @InjectRepository(PadronElectoral)
    private readonly padronElectoralRepository: Repository<PadronElectoral>,
  ) {}

  async obtenerCriterioHash(idEleccion: number): Promise<CriterioHashPadron> {
    const padron = await this.padronElectoralRepository.findOne({
      where: { eleccion: { idEleccion } },
      select: ['idPadron', 'criterioHash'],
    });
    return padron?.criterioHash ?? CriterioHashPadron.DNI;
  }

  async isVotanteHabilitado(
    idEleccion: number,
    votanteHash: string,
  ): Promise<boolean> {
    const count = await this.padronVotanteRepository
      .createQueryBuilder('votante')
      .innerJoin('votante.padron', 'padron')
      .innerJoin('padron.eleccion', 'eleccion')
      .where('eleccion.idEleccion = :idEleccion', { idEleccion })
      .andWhere('votante.hashHoja = :votanteHash', { votanteHash })
      .getCount();
    return count > 0;
  }
}
