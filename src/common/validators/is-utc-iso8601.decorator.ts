import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const UTC_ISO8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/i;

export const isUtcIso8601DateTime = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!UTC_ISO8601_PATTERN.test(trimmed)) {
    return false;
  }

  return !Number.isNaN(new Date(trimmed).getTime());
};

export const IsUtcIso8601 = (validationOptions?: ValidationOptions) => {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isUtcIso8601',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isUtcIso8601DateTime(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} debe ser una fecha ISO 8601 con zona horaria explícita (UTC recomendado)`;
        },
      },
    });
  };
};
