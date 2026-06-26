import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';

@Injectable()
export class PadronEligibilityService {
  constructor(
    @InjectRepository(PadronVotante)
    private readonly padronVotanteRepository: Repository<PadronVotante>,
  ) {}

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
