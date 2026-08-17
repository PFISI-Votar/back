import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: false, // STARTTLS en 587, no SSL directo
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  /**
   * Envía un mail. Devuelve true/false en vez de relanzar la excepción,
   * para que el caller (ej. un scheduler) decida qué hacer ante un fallo
   * de envío sin que un error de mail tumbe el proceso que lo llama.
   */
  async sendMail(options: MailOptions): Promise<boolean> {
    try {
      const from = this.configService.get<string>('SMTP_FROM');
      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      this.logger.log(`Mail enviado a ${options.to} (messageId: ${info.messageId})`);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido al enviar mail';
      this.logger.error(`Error al enviar mail a ${options.to}: ${message}`);
      return false;
    }
  }
}