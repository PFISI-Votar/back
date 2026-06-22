import { UnprocessableEntityException } from '@nestjs/common';
import { MinimoCandidatosViolation } from '@/eleccion/rules-engine/interfaces/minimo-candidatos-context.interface';

export class MinimoCandidatosViolationException extends UnprocessableEntityException {
  constructor(violations: MinimoCandidatosViolation[]) {
    super({
      statusCode: 422,
      message:
        'No se puede oficializar: hay listas con candidatos insuficientes',
      violations,
    });
  }
}
