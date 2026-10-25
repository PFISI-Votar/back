import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SeccionDashboardVisibleGuard } from '@/dashboard-publico/guards/seccion-dashboard-visible.guard';
import { SeccionDashboard } from '@/eleccion/configuracion-comicio/constants/visibilidad-dashboard.constants';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const buildContext = (idEleccion: unknown) => {
  const handler = () => undefined;
  class TestController {}
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ params: { idEleccion } }),
    }),
  } as unknown as ExecutionContext;
};

describe('SeccionDashboardVisibleGuard', () => {
  let eleccionRepository: { findOne: jest.Mock };
  let configRepository: { findOne: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: SeccionDashboardVisibleGuard;

  beforeEach(() => {
    eleccionRepository = { findOne: jest.fn() };
    configRepository = { findOne: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new SeccionDashboardVisibleGuard(
      reflector as unknown as Reflector,
      eleccionRepository as never,
      configRepository as never,
    );
  });

  it('deja pasar si el endpoint no declaró SeccionDashboardTag', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const actual = await guard.canActivate(buildContext(1));

    expect(actual).toBe(true);
    expect(eleccionRepository.findOne).not.toHaveBeenCalled();
  });

  it('deja pasar si la elección no existe (el 404 lo resuelve el servicio)', async () => {
    reflector.getAllAndOverride.mockReturnValue(SeccionDashboard.RESULTADOS);
    eleccionRepository.findOne.mockResolvedValue(null);

    const actual = await guard.canActivate(buildContext(99));

    expect(actual).toBe(true);
  });

  it('lanza 403 cuando la sección está oculta y el comicio está ABIERTA', async () => {
    reflector.getAllAndOverride.mockReturnValue(SeccionDashboard.RESULTADOS);
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.ABIERTA,
    });
    configRepository.findOne.mockResolvedValue({
      mostrarDashboardResultados: false,
    });

    await expect(guard.canActivate(buildContext(1))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('deja pasar cuando la sección está visible', async () => {
    reflector.getAllAndOverride.mockReturnValue(SeccionDashboard.RESULTADOS);
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.ABIERTA,
    });
    configRepository.findOne.mockResolvedValue({
      mostrarDashboardResultados: true,
    });

    const actual = await guard.canActivate(buildContext(1));

    expect(actual).toBe(true);
  });

  it('deja pasar cuando la sección está oculta pero el comicio ya cerró', async () => {
    reflector.getAllAndOverride.mockReturnValue(SeccionDashboard.RESULTADOS);
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.CERRADA,
    });
    configRepository.findOne.mockResolvedValue({
      mostrarDashboardResultados: false,
    });

    const actual = await guard.canActivate(buildContext(1));

    expect(actual).toBe(true);
  });
});
