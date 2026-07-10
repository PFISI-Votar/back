import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  esArchivoPadronSoportado,
  esExcel,
  extraerFilasIdentidad,
} from '../utils/parse-padron-archivo.util';

function buildExcelBuffer(filas: string[][]): Buffer {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Padron');
  return Buffer.from(
    XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  );
}

describe('parse-padron-archivo.util', () => {
  describe('esArchivoPadronSoportado', () => {
    it('acepta CSV por extensión o mime', () => {
      expect(esArchivoPadronSoportado('padron.csv', 'text/csv')).toBe(true);
      expect(esArchivoPadronSoportado('padron.CSV', 'application/octet-stream')).toBe(
        true,
      );
    });

    it('acepta Excel por extensión o mime', () => {
      expect(
        esArchivoPadronSoportado(
          'padron.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ),
      ).toBe(true);
      expect(esArchivoPadronSoportado('padron.xls', 'application/vnd.ms-excel')).toBe(
        true,
      );
    });

    it('rechaza formatos no soportados', () => {
      expect(esArchivoPadronSoportado('padron.pdf', 'application/pdf')).toBe(
        false,
      );
    });
  });

  describe('esExcel', () => {
    it('detecta excel por extensión', () => {
      expect(esExcel('a.xlsx', 'text/plain')).toBe(true);
      expect(esExcel('a.csv', 'text/csv')).toBe(false);
    });
  });

  describe('extraerFilasIdentidad', () => {
    it('parsea CSV con columnas extra ignoradas', () => {
      const buffer = Buffer.from(
        'dni,nombre,email,direccion\n30111222,Ana,ana@frvm.utn.edu.ar,Calle 1\n',
        'utf-8',
      );
      const filas = extraerFilasIdentidad(buffer, 'padron.csv', 'text/csv');
      expect(filas).toEqual([
        { linea: 2, dni: '30111222', email: 'ana@frvm.utn.edu.ar' },
      ]);
    });

    it('parsea Excel con columnas dni y email', () => {
      const buffer = buildExcelBuffer([
        ['dni', 'email', 'apellido'],
        ['30111222', 'ana@frvm.utn.edu.ar', 'Pérez'],
        ['30999888', 'luis@frvm.utn.edu.ar', 'Gómez'],
      ]);
      const filas = extraerFilasIdentidad(
        buffer,
        'padron.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(filas).toHaveLength(2);
      expect(filas[0]).toEqual({
        linea: 2,
        dni: '30111222',
        email: 'ana@frvm.utn.edu.ar',
      });
      expect(filas[1]).toEqual({
        linea: 3,
        dni: '30999888',
        email: 'luis@frvm.utn.edu.ar',
      });
    });

    it('omite líneas en blanco del CSV preservando numeración', () => {
      const buffer = Buffer.from(
        'dni,email\n30111222,a@a.com\n\n30999888,b@b.com\n',
        'utf-8',
      );
      const filas = extraerFilasIdentidad(buffer, 'padron.csv', 'text/csv');
      expect(filas).toHaveLength(2);
      expect(filas[1].linea).toBe(4);
    });

    it('lanza 400 si faltan columnas requeridas', () => {
      const buffer = Buffer.from('nombre,apellido\nAna,Pérez\n', 'utf-8');
      expect(() =>
        extraerFilasIdentidad(buffer, 'padron.csv', 'text/csv'),
      ).toThrow(BadRequestException);
    });
  });
});
