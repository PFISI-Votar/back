import { UnprocessableEntityException } from '@nestjs/common';
import { CampoCandidatoError } from '../interfaces/campo-candidato-definicion.interface';

export class DatosAdicionalesValidationException extends UnprocessableEntityException {
  constructor(errors: CampoCandidatoError[]) {
    super({
      statusCode: 422,
      message: 'Validación de datos adicionales fallida',
      errors,
    });
  }
}
