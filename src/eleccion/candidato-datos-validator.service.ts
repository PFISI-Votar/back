import { Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { DatosAdicionalesValidationException } from './exceptions/datos-adicionales-validation.exception';
import {
  CampoCandidatoDefinicion,
  CampoCandidatoError,
} from './interfaces/campo-candidato-definicion.interface';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class CandidatoDatosValidatorService {
  validateDatosAdicionales(
    campos: CampoCandidatoDefinicion[],
    datos: Record<string, unknown>,
  ): void {
    const errors: CampoCandidatoError[] = [];
    const clavesConfig = new Set(campos.map((campo) => campo.clave));
    for (const campo of campos) {
      const valor = datos[campo.clave];
      const campoErrors = this.validateCampo(campo, valor);
      errors.push(...campoErrors);
    }
    for (const clave of Object.keys(datos)) {
      if (!clavesConfig.has(clave)) {
        errors.push({
          clave,
          message: `El campo "${clave}" no está definido en la configuración del comicio`,
        });
      }
    }
    if (errors.length > 0) {
      throw new DatosAdicionalesValidationException(errors);
    }
  }

  private validateCampo(
    campo: CampoCandidatoDefinicion,
    valor: unknown,
  ): CampoCandidatoError[] {
    const isEmpty =
      valor === undefined ||
      valor === null ||
      (typeof valor === 'string' && valor.trim() === '');
    if (isEmpty) {
      if (campo.obligatorio) {
        return [{ clave: campo.clave, message: `${campo.etiqueta} es obligatorio` }];
      }
      return [];
    }
    switch (campo.tipo) {
      case 'texto':
        return this.validateTexto(campo, valor);
      case 'numero':
        return this.validateNumero(campo, valor);
      case 'email':
        return this.validateEmail(campo, valor);
      case 'url':
        return this.validateUrl(campo, valor);
      case 'fecha':
        return this.validateFecha(campo, valor);
      case 'booleano':
        return this.validateBooleano(campo, valor);
      default:
        return [{ clave: campo.clave, message: `Tipo de campo desconocido: ${campo.tipo}` }];
    }
  }

  private validateTexto(
    campo: CampoCandidatoDefinicion,
    valor: unknown,
  ): CampoCandidatoError[] {
    if (typeof valor !== 'string') {
      return [{ clave: campo.clave, message: `${campo.etiqueta} debe ser texto` }];
    }
    const texto = sanitizeHtml(valor.trim(), { allowedTags: [], allowedAttributes: {} });
    return this.validateLongitudYPattern(campo, texto);
  }

  private validateEmail(
    campo: CampoCandidatoDefinicion,
    valor: unknown,
  ): CampoCandidatoError[] {
    if (typeof valor !== 'string') {
      return [{ clave: campo.clave, message: `${campo.etiqueta} debe ser un email` }];
    }
    const email = valor.trim();
    if (!EMAIL_REGEX.test(email)) {
      return [{ clave: campo.clave, message: `${campo.etiqueta} no es un email válido` }];
    }
    return this.validateLongitudYPattern(campo, email);
  }

  private validateUrl(
    campo: CampoCandidatoDefinicion,
    valor: unknown,
  ): CampoCandidatoError[] {
    if (typeof valor !== 'string') {
      return [{ clave: campo.clave, message: `${campo.etiqueta} debe ser una URL` }];
    }
    const url = valor.trim();
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return [{ clave: campo.clave, message: `${campo.etiqueta} debe usar http o https` }];
      }
    } catch {
      return [{ clave: campo.clave, message: `${campo.etiqueta} no es una URL válida` }];
    }
    return this.validateLongitudYPattern(campo, url);
  }

  private validateNumero(
    campo: CampoCandidatoDefinicion,
    valor: unknown,
  ): CampoCandidatoError[] {
    const numero = typeof valor === 'number' ? valor : Number(valor);
    if (!Number.isFinite(numero)) {
      return [{ clave: campo.clave, message: `${campo.etiqueta} debe ser un número` }];
    }
    const errors: CampoCandidatoError[] = [];
    const { min, max } = campo.validacion ?? {};
    if (min !== undefined && numero < min) {
      errors.push({
        clave: campo.clave,
        message: `${campo.etiqueta} debe ser al menos ${min}`,
      });
    }
    if (max !== undefined && numero > max) {
      errors.push({
        clave: campo.clave,
        message: `${campo.etiqueta} no puede superar ${max}`,
      });
    }
    return errors;
  }

  private validateFecha(
    campo: CampoCandidatoDefinicion,
    valor: unknown,
  ): CampoCandidatoError[] {
    if (typeof valor !== 'string') {
      return [{ clave: campo.clave, message: `${campo.etiqueta} debe ser una fecha válida` }];
    }
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) {
      return [{ clave: campo.clave, message: `${campo.etiqueta} no es una fecha válida` }];
    }
    return [];
  }

  private validateBooleano(
    campo: CampoCandidatoDefinicion,
    valor: unknown,
  ): CampoCandidatoError[] {
    if (typeof valor !== 'boolean') {
      return [{ clave: campo.clave, message: `${campo.etiqueta} debe ser verdadero o falso` }];
    }
    return [];
  }

  private validateLongitudYPattern(
    campo: CampoCandidatoDefinicion,
    texto: string,
  ): CampoCandidatoError[] {
    const errors: CampoCandidatoError[] = [];
    const { minLength, maxLength, pattern, patternMessage } = campo.validacion ?? {};
    if (minLength !== undefined && texto.length < minLength) {
      errors.push({
        clave: campo.clave,
        message: `${campo.etiqueta} debe tener al menos ${minLength} caracteres`,
      });
    }
    if (maxLength !== undefined && texto.length > maxLength) {
      errors.push({
        clave: campo.clave,
        message: `${campo.etiqueta} no puede superar ${maxLength} caracteres`,
      });
    }
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(texto)) {
          errors.push({
            clave: campo.clave,
            message: patternMessage ?? `${campo.etiqueta} tiene un formato inválido`,
          });
        }
      } catch {
        errors.push({
          clave: campo.clave,
          message: `Configuración inválida: patrón de ${campo.etiqueta} no es válido`,
        });
      }
    }
    return errors;
  }
}
