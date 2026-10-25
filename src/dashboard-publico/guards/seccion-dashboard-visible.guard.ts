import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { SECCION_DASHBOARD_METADATA_KEY } from '@/dashboard-publico/decorators/seccion-dashboard.decorator';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import {
  SeccionDashboard,
  isSeccionDashboardVisible,
} from '@/eleccion/configuracion-comicio/constants/visibilidad-dashboard.constants';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

/**
 * VOTAR-459: bloquea con 403 los endpoints públicos del Dashboard cuya
 * solapa fue ocultada por la autoridad electoral mientras el comicio no
 * cerró. No filtra existencia del comicio: si no existe, deja pasar para
 * que el servicio de destino responda su 404 habitual.
 */
@Injectable()
export class SeccionDashboardVisibleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configRepository: Repository<ConfiguracionComicio>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const seccion = this.reflector.getAllAndOverride<
      SeccionDashboard | undefined
    >(SECCION_DASHBOARD_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!seccion) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const idEleccion = Number(request.params.idEleccion);
    if (!Number.isFinite(idEleccion) || idEleccion <= 0) {
      return true;
    }

    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      return true;
    }
    const config = await this.configRepository.findOne({
      where: { idEleccion },
    });
    if (!config) {
      return true;
    }

    if (!isSeccionDashboardVisible(config, eleccion.estado, seccion)) {
      throw new ForbiddenException(
        'La sección no está disponible públicamente mientras el comicio está en curso',
      );
    }
    return true;
  }
}
