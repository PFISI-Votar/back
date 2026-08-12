import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { resolveAllowedOriginsFromEnv } from '@/config/cors.config';

export type ResultadosActualizadosPayload = {
  idEleccion: number;
  actualizadoEn: string;
  totalVotos: number;
};

/**
 * Gateway WebSocket para eventos de elecciones en tiempo real.
 * Emite eventos cuando una elección cambia de estado (ej: apertura automática).
 * VOTAR-364: rooms por comicio para push de resultados del Dashboard público.
 */
@WebSocketGateway({
  cors: {
    origin: resolveAllowedOriginsFromEnv(),
    credentials: true,
  },
  namespace: '/elecciones',
})
export class EleccionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EleccionGateway.name);

  handleConnection(client: Socket): void {
    const clientId = client.id;
    this.logger.log(`Cliente WebSocket conectado: ${clientId}`);
  }

  handleDisconnect(client: Socket): void {
    const clientId = client.id;
    this.logger.log(`Cliente WebSocket desconectado: ${clientId}`);
  }

  /**
   * Dashboard público: join room for live tally updates (VOTAR-364).
   */
  @SubscribeMessage('dashboard:subscribe')
  handleDashboardSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { idEleccion?: number },
  ): void {
    const idEleccion = Number(body?.idEleccion);
    if (!Number.isFinite(idEleccion) || idEleccion <= 0) {
      return;
    }
    const room = this.roomName(idEleccion);
    void client.join(room);
    this.logger.debug(`Cliente ${client.id} suscripto a ${room}`);
  }

  /**
   * Dashboard público: leave room when navigating away (VOTAR-364).
   */
  @SubscribeMessage('dashboard:unsubscribe')
  handleDashboardUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { idEleccion?: number },
  ): void {
    const idEleccion = Number(body?.idEleccion);
    if (!Number.isFinite(idEleccion) || idEleccion <= 0) {
      return;
    }
    const room = this.roomName(idEleccion);
    void client.leave(room);
    this.logger.debug(`Cliente ${client.id} desuscripto de ${room}`);
  }

  /**
   * Emite un evento de elección abierta a todos los clientes conectados.
   * @param idEleccion ID de la elección que fue abierta
   */
  emitEleccionAbierta(idEleccion: number): void {
    this.logger.log(`Emitiendo evento de apertura para elección ${idEleccion}`);
    this.server.emit('eleccion:abierta', { idEleccion });
  }

  /**
   * Emite un evento de Merkle publicado on-chain a todos los clientes conectados.
   * @param idEleccion ID de la elección cuya raíz Merkle fue publicada
   */
  emitMerklePublicado(idEleccion: number): void {
    this.logger.log(
      `Emitiendo evento de Merkle publicado para elección ${idEleccion}`,
    );
    this.server.emit('eleccion:merkle-publicado', { idEleccion });
  }

  /**
   * Emite un evento de elección cerrada a todos los clientes conectados (VOTAR-321).
   * @param idEleccion ID de la elección que fue cerrada
   */
  emitEleccionCerrada(idEleccion: number): void {
    this.logger.log(`Emitiendo evento de cierre para elección ${idEleccion}`);
    this.server.emit('eleccion:cerrada', { idEleccion });
  }

  /**
   * VOTAR-347 — emite pausa/reanudación de emergencia a todos los clientes
   * conectados (autoridades y observadores monitoreando el comicio).
   */
  emitEleccionPausada(idEleccion: number, razon: string): void {
    this.logger.log(`Emitiendo evento de pausa para elección ${idEleccion}`);
    this.server.emit('eleccion:pausada', { idEleccion, razon });
  }

  emitEleccionReanudada(idEleccion: number): void {
    this.logger.log(
      `Emitiendo evento de reanudación para elección ${idEleccion}`,
    );
    this.server.emit('eleccion:reanudada', { idEleccion });
  }

  /**
   * Emite un evento de elección archivada a todos los clientes conectados (VOTAR-322).
   * @param idEleccion ID de la elección que fue archivada
   */
  emitEleccionArchivada(idEleccion: number): void {
    this.logger.log(
      `Emitiendo evento de archivado para elección ${idEleccion}`,
    );
    this.server.emit('eleccion:archivada', { idEleccion });
  }

  /**
   * VOTAR-364: push tally update to dashboard subscribers of a comicio.
   */
  emitResultadosActualizados(payload: ResultadosActualizadosPayload): void {
    this.logger.log(
      `Emitiendo resultados actualizados para elección ${payload.idEleccion} (total=${payload.totalVotos})`,
    );
    this.server
      .to(this.roomName(payload.idEleccion))
      .emit('resultados:actualizados', payload);
  }

  private roomName(idEleccion: number): string {
    return `eleccion:${idEleccion}`;
  }
}
