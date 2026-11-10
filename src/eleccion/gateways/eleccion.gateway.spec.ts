import type { Socket } from 'socket.io';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import * as visibilidad from '@/eleccion/configuracion-comicio/constants/visibilidad-dashboard.constants';

describe('EleccionGateway — VOTAR-518 aviso de dashboard', () => {
  let gateway: EleccionGateway;
  let join: jest.Mock;
  let leave: jest.Mock;
  let client: Socket;
  let emit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    const eleccionRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ idEleccion: 7, estado: 'ABIERTA' }),
    };
    const configRepo = { findOne: jest.fn().mockResolvedValue({}) };
    gateway = new EleccionGateway(eleccionRepo as never, configRepo as never);
    join = jest.fn();
    leave = jest.fn();
    client = { id: 'c1', join, leave } as unknown as Socket;
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
  });

  afterEach(() => jest.restoreAllMocks());

  it('con Resultados visible se une a la sala de resultados y a la de aviso', async () => {
    jest.spyOn(visibilidad, 'isSeccionDashboardVisible').mockReturnValue(true);
    await gateway.handleDashboardSubscribe(client, { idEleccion: 7 });
    expect(join).toHaveBeenCalledWith('eleccion:7');
    expect(join).toHaveBeenCalledWith('dashboard-aviso:7');
  });

  it('con Resultados oculto solo se une a la sala de aviso', async () => {
    jest.spyOn(visibilidad, 'isSeccionDashboardVisible').mockReturnValue(false);
    await gateway.handleDashboardSubscribe(client, { idEleccion: 7 });
    expect(join).toHaveBeenCalledWith('dashboard-aviso:7');
    expect(join).not.toHaveBeenCalledWith('eleccion:7');
  });

  it('unsubscribe abandona ambas salas', () => {
    gateway.handleDashboardUnsubscribe(client, { idEleccion: 7 });
    expect(leave).toHaveBeenCalledWith('eleccion:7');
    expect(leave).toHaveBeenCalledWith('dashboard-aviso:7');
  });

  it('emitDashboardActualizado envía solo idEleccion a la sala de aviso', () => {
    gateway.emitDashboardActualizado(7);
    expect(to).toHaveBeenCalledWith('dashboard-aviso:7');
    expect(emit).toHaveBeenCalledWith('dashboard:actualizado', {
      idEleccion: 7,
    });
  });
});
