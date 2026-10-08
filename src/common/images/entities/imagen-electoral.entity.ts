import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import type { ElectoralImageKind } from '@/common/images/electoral-image.service';

/**
 * VOTAR-466 — bytes de las imágenes electorales (foto de candidato, logo de
 * lista, logo institucional) persistidos en Postgres. Antes vivían en el
 * disco local del contenedor: la fila de dominio (candidato.foto_url, etc.)
 * sobrevivía a un `docker compose down/up` porque está en el volumen de
 * Postgres, pero el archivo no, dejando referencias rotas. Al mover los
 * bytes acá, heredan el mismo volumen persistente que el resto del estado.
 */
@Entity('imagen_electoral')
export class ImagenElectoral {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid', { name: 'id_imagen' })
  idImagen!: string;

  @ApiProperty({ example: 'candidato-foto' })
  @Column({ name: 'tipo', type: 'varchar', length: 32 })
  tipo!: ElectoralImageKind;

  @ApiProperty({
    example: 'image/webp',
    description: 'El contenido siempre se re-codifica a WebP al guardar.',
  })
  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType!: string;

  /**
   * `select: false`: ningún find() de dominio (Candidato, Lista, etc. no
   * referencian esta entidad) debe arrastrar megabytes por accidente. El
   * controlador los pide explícito con addSelect (ver obtenerImagen()).
   */
  @Column({ name: 'contenido', type: 'bytea', select: false })
  contenido!: Buffer;

  @ApiProperty({ example: 48213 })
  @Column({ name: 'tamano_bytes', type: 'int' })
  tamanoBytes!: number;

  @ApiProperty({
    example: 'a3f1c9...',
    description: 'SHA-256 hexadecimal del contenido; se usa como ETag HTTP.',
  })
  @Column({ name: 'checksum_sha256', type: 'char', length: 64 })
  checksumSha256!: string;

  @ApiProperty({ example: 400 })
  @Column({ name: 'ancho', type: 'int' })
  ancho!: number;

  @ApiProperty({ example: 400 })
  @Column({ name: 'alto', type: 'int' })
  alto!: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion!: Date;
}
