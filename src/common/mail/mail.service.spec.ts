// src/common/mail/mail.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const sendMailMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: (...args: unknown[]) => sendMailMock(...args),
  })),
}));

describe('MailService', () => {
  let service: MailService;

  const configValues: Record<string, string> = {
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'votarfaucet@gmail.com',
    SMTP_PASSWORD: 'app-password',
    SMTP_FROM: 'votarfaucet@gmail.com',
  };

  beforeEach(async () => {
    sendMailMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMail', () => {
    it('devuelve true y loguea el messageId cuando el envío es exitoso', async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: 'abc-123' });

      const result = await service.sendMail({
        to: 'auditor@utn.edu.ar',
        subject: '[VOTAR] Alerta de prueba',
        text: 'Contenido de prueba',
      });

      expect(result).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'votarfaucet@gmail.com',
          to: 'auditor@utn.edu.ar',
          subject: '[VOTAR] Alerta de prueba',
          text: 'Contenido de prueba',
        }),
      );
    });

    it('devuelve false y no relanza la excepción cuando el envío falla', async () => {
      sendMailMock.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const result = await service.sendMail({
        to: 'auditor@utn.edu.ar',
        subject: '[VOTAR] Alerta de prueba',
        text: 'Contenido de prueba',
      });

      expect(result).toBe(false);
    });
  });
});