import { UnprocessableEntityException } from '@nestjs/common';

export type CrearEleccionValidationField =
  | 'metodosAutenticacion'
  | 'fechaInicio'
  | 'fechaFin';

export type CrearEleccionValidationError = {
  field: CrearEleccionValidationField;
  message: string;
};

export class CrearEleccionValidationException extends UnprocessableEntityException {
  constructor(errors: CrearEleccionValidationError[]) {
    super({ message: 'Error de validación al crear el comicio', errors });
  }
}
