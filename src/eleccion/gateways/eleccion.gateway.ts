import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

/**
 * Gateway WebSocket para eventos de elecciones en tiempo real.
 * Emite eventos cuando una elección cambia de estado (ej: apertura automática).
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
   * Emite un evento de elección abierta a todos los clientes conectados.
   * @param idEleccion ID de la elección que fue abierta
   */
  emitEleccionAbierta(idEleccion: number): void {
    this.logger.log(`Emitiendo evento de apertura para elección ${idEleccion}`);
    this.server.emit('eleccion:abierta', { idEleccion });
  }
}
