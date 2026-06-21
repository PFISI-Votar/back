import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { CrearEleccionValidationException } from '@/eleccion/exceptions/crear-eleccion-validation.exception';

@Injectable()
export class ConfiguracionComicioService {
  constructor(
    @InjectRepository(ConfiguracionComicio)
    private readonly configRepository: Repository<ConfiguracionComicio>,
  ) {}

  assertMetodosAutenticacionValidos(metodos: MetodoAutenticacion[]): void {
    if (!metodos || metodos.length === 0) {
      throw new CrearEleccionValidationException([
        {
          field: 'metodosAutenticacion',
          message:
            'Debe definir al menos un método de inicio de sesión activo.',
        },
      ]);
    }
  }

  async crearConfiguracionInicial(
    idEleccion: number,
    metodosAutenticacion: MetodoAutenticacion[],
  ): Promise<ConfiguracionComicio> {
    this.assertMetodosAutenticacionValidos(metodosAutenticacion);
    const config = this.configRepository.create({
      idEleccion,
      metodosAutenticacion,
      permitirVotoEnBlanco: false,
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      minIntervaloSegundos: 0,
      mostrarResultadosTiempoReal: false,
      politicaRevoto: PoliticaRevoto.DISABLED,
    });
    return this.configRepository.save(config);
  }
}
