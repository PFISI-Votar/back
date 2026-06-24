import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutogestionLoginResponse,
  AutogestionUsuarioResponse,
} from '@/auth/interfaces/autogestion-usuario.interface';

@Injectable()
export class AutogestionService {
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('AUTOGESTION_BASE_URL') ??
      'https://webservice.frvm.utn.edu.ar/autogestion';
    this.userAgent =
      this.configService.get<string>('AUTOGESTION_USER_AGENT') ??
      'votar-back/1.0';
  }

  async login(nick: string, password: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'User-Agent': this.userAgent,
        nick,
        password,
      },
    });
    if (!response.ok) {
      throw new UnauthorizedException('Credenciales institucionales inválidas');
    }
    const data = (await response.json()) as AutogestionLoginResponse;
    if (!data.hashActual) {
      throw new InternalServerErrorException(
        'Autogestión no devolvió hashActual tras login exitoso',
      );
    }
    return data.hashActual;
  }

  async fetchUsuario(
    nick: string,
    hash: string,
  ): Promise<AutogestionUsuarioResponse> {
    const auth = Buffer.from(`${nick}:${hash}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/usuarios`, {
      headers: {
        Accept: '*/*',
        'User-Agent': this.userAgent,
        nick,
        Authorization: `Basic ${auth}`,
      },
    });
    if (!response.ok) {
      throw new UnauthorizedException(
        'No se pudo verificar la identidad institucional',
      );
    }
    return (await response.json()) as AutogestionUsuarioResponse;
  }
}
