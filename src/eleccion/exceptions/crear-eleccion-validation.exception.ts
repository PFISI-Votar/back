import { UnprocessableEntityException } from '@nestjs/common';

export type CrearEleccionFieldError = {
  field: 'roles' | 'metodosAutenticacion' | 'fechaInicio' | 'fechaFin';
  message: string;
};

export class CrearEleccionValidationException extends UnprocessableEntityException {
  constructor(errors: CrearEleccionFieldError[]) {
    super({
      statusCode: 422,
      message: 'Validación de creación de comicio fallida',
      errors,
    });
  }
}
