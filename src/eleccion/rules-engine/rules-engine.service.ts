import { Injectable } from '@nestjs/common';
import {
  MinimoCandidatosContext,
  MinimoCandidatosValidationResult,
  MinimoCandidatosViolation,
} from '@/eleccion/rules-engine/interfaces/minimo-candidatos-context.interface';

@Injectable()
export class RulesEngineService {
  validateMinimoCandidatos(
    context: MinimoCandidatosContext,
  ): MinimoCandidatosValidationResult {
    const violations: MinimoCandidatosViolation[] = [];
    const categoriasConMinimo = context.categorias.filter(
      (categoria) => categoria.minimoPostulantes > 0,
    );
    if (categoriasConMinimo.length === 0) {
      return { valid: true, violations: [] };
    }
    for (const lista of context.listas) {
      for (const categoria of categoriasConMinimo) {
        const cantidadActual = lista.candidatos.filter(
          (candidato) => candidato.idCategoria === categoria.idCategoria,
        ).length;
        if (cantidadActual >= categoria.minimoPostulantes) {
          continue;
        }
        const faltantes = categoria.minimoPostulantes - cantidadActual;
        violations.push({
          idLista: lista.idLista,
          nombreLista: lista.nombre,
          siglaLista: lista.sigla,
          idCategoria: categoria.idCategoria,
          nombreCategoria: categoria.nombre,
          minimoRequerido: categoria.minimoPostulantes,
          cantidadActual,
          faltantes,
          message: `La lista "${lista.nombre}" requiere ${faltantes} candidato(s) más en la categoría "${categoria.nombre}" (tiene ${cantidadActual}, mínimo ${categoria.minimoPostulantes}).`,
        });
      }
    }
    return {
      valid: violations.length === 0,
      violations,
    };
  }
}
