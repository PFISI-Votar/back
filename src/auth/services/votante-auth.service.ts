import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VOTANTE_CREDENCIALES_INVALIDAS } from '@/auth/constants/votante-auth.constants';
import { VotanteLoginDto } from '@/auth/dto/votante-login.dto';
import {
  VotanteAuthResponseDto,
  VotanteAuthUserDto,
} from '@/auth/dto/votante-auth-response.dto';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { VoterJwtPayload } from '@/auth/interfaces/voter-jwt-payload.interface';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwksService } from '@/auth/services/jwks.service';
import { resolveDni } from '@/auth/utils/resolve-dni.util';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { PadronEligibilityService } from '@/padron/services/padron-eligibility.service';
import { hashVotante } from '@/padron/utils/keccak.util';
import { parseDurationToSeconds } from '@/auth/utils/parse-duration.util';

export type VotanteAuthLoginResult = {
  accessToken: string;
  user: VotanteAuthUserDto;
};

@Injectable()
export class VotanteAuthService {
  constructor(
    private readonly autogestionService: AutogestionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly padronEligibilityService: PadronEligibilityService,
    private readonly jwksService: JwksService,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
  ) {}

  async login(dto: VotanteLoginDto): Promise<VotanteAuthLoginResult> {
    const nick = dto.nick.trim();
    const idEleccion = dto.idEleccion;
    await this.assertEleccionExists(idEleccion);
    await this.assertSsoInstitucionalHabilitado(idEleccion);
    const hash = await this.autogestionService.login(nick, dto.password);
    const usuario = await this.autogestionService.fetchUsuario(nick, hash);
    if (!usuario.persona) {
      throw new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS);
    }
    const persona = usuario.persona;
    const dni = resolveDni(persona);
    const email = persona.email ?? persona.mail;
    if (!dni || !email) {
      throw new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS);
    }
    const votanteHash = hashVotante(dni, email);
    const habilitado = await this.padronEligibilityService.isVotanteHabilitado(
      idEleccion,
      votanteHash,
    );
    if (!habilitado) {
      throw new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS);
    }
    const sub = persona.legajo?.toString() ?? nick;
    const name = [persona.nombre, persona.apellido].filter(Boolean).join(' ');
    this.jwksService.assertCanIssueLocalAccessTokens();
    const payload: VoterJwtPayload = {
      sub,
      role: JwtRole.VOTER,
      votanteHash,
      idEleccion,
      email: email ?? undefined,
      name: name || undefined,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.getVoterAccessExpiresIn(),
    });
    return {
      accessToken,
      user: this.toAuthUser(payload),
    };
  }

  toAuthUser(payload: VoterJwtPayload): VotanteAuthUserDto {
    return {
      sub: payload.sub,
      role: payload.role,
      idEleccion: payload.idEleccion,
      email: payload.email,
      name: payload.name,
    };
  }

  toAuthResponse(payload: VoterJwtPayload): VotanteAuthResponseDto {
    return { user: this.toAuthUser(payload) };
  }

  getVoterAccessTtlSeconds(): number {
    return parseDurationToSeconds(this.getVoterAccessExpiresIn());
  }

  private getVoterAccessExpiresIn(): `${number}${'s' | 'm' | 'h' | 'd'}` {
    const expiresIn =
      this.configService.get<string>('JWT_VOTER_ACCESS_EXPIRES_IN') ?? '30m';
    return expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`;
  }

  private async assertEleccionExists(idEleccion: number): Promise<void> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS);
    }
  }

  private async assertSsoInstitucionalHabilitado(
    idEleccion: number,
  ): Promise<void> {
    const configuracion = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (
      !configuracion?.metodosAutenticacion.includes(
        MetodoAutenticacion.SSO_INSTITUCIONAL,
      )
    ) {
      throw new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS);
    }
  }
}
