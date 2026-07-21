import { Injectable } from '@nestjs/common';
import { EscrutinioResponseDto } from '@/escrutinio/dto/escrutinio-response.dto';

type CacheEntry = {
  snapshot: EscrutinioResponseDto;
  fingerprint: string;
};

/**
 * In-memory cache of escrutinio snapshots (VOTAR-364).
 * Tallies are never persisted to PostgreSQL (privacy invariant §7.1).
 */
@Injectable()
export class EscrutinioCacheService {
  private readonly cache = new Map<number, CacheEntry>();

  get(idEleccion: number): EscrutinioResponseDto | null {
    return this.cache.get(idEleccion)?.snapshot ?? null;
  }

  getFingerprint(idEleccion: number): string | null {
    return this.cache.get(idEleccion)?.fingerprint ?? null;
  }

  set(idEleccion: number, snapshot: EscrutinioResponseDto): void {
    this.cache.set(idEleccion, {
      snapshot,
      fingerprint: this.buildFingerprint(snapshot),
    });
  }

  delete(idEleccion: number): void {
    this.cache.delete(idEleccion);
  }

  buildFingerprint(snapshot: EscrutinioResponseDto): string {
    const candidatos = snapshot.candidatos
      .map((c) => `${c.idCandidato}:${c.votos}`)
      .join(',');
    const { totalVotos, votosBlanco, votosNulo } = snapshot.participacion;
    return `${totalVotos}|${votosBlanco}|${votosNulo}|${candidatos}`;
  }
}
