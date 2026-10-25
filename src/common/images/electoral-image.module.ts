import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElectoralImageController } from '@/common/images/electoral-image.controller';
import { ElectoralImageService } from '@/common/images/electoral-image.service';
import { ImagenElectoral } from '@/common/images/entities/imagen-electoral.entity';

/**
 * VOTAR-466 — módulo compartido de almacenamiento de imágenes electorales.
 * Importado por candidato, lista y configuracion-sistema (los tres
 * consumidores de ElectoralImageService), y expone GET /imagenes/:idImagen.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ImagenElectoral])],
  controllers: [ElectoralImageController],
  providers: [ElectoralImageService],
  exports: [ElectoralImageService],
})
export class ElectoralImageModule {}
