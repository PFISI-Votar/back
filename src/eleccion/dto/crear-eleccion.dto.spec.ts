import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';

const buildValidPlain = () => ({
  nombre: 'Comicio Seguro',
  fechaInicio: new Date(Date.now() + 86400000).toISOString(),
  fechaFin: new Date(Date.now() + 172800000).toISOString(),
  tipoVotacion: TipoVotacion.POR_LISTA,
  roles: [{ nombre: 'Presidente', maximoPostulantes: 1 }],
  metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
});

describe('CrearEleccionDto', () => {
  it('sanitiza scripts maliciosos en el nombre', () => {
    const plain = buildValidPlain();
    plain.nombre = '<script>alert(1)</script>Comicio Seguro';

    const dto = plainToInstance(CrearEleccionDto, plain, {
      enableImplicitConversion: true,
    });

    expect(dto.nombre).toBe('Comicio Seguro');
    expect(dto.nombre).not.toContain('<script>');
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('sanitiza scripts maliciosos en la descripción', () => {
    const plain = {
      ...buildValidPlain(),
      descripcion: '<img src=x onerror=alert(1)>Descripción',
    };

    const dto = plainToInstance(CrearEleccionDto, plain, {
      enableImplicitConversion: true,
    });

    expect(dto.descripcion).not.toContain('onerror');
    expect(dto.descripcion).not.toContain('<img');
    expect(validateSync(dto)).toHaveLength(0);
  });
});
