import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginDto } from '@/auth/dto/login.dto';
import { AuthResponseDto } from '@/auth/dto/auth-response.dto';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';
import { AutogestionService } from '@/auth/services/autogestion.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly autogestionService: AutogestionService,
    private readonly jwtService: JwtService,
    @InjectRepository(AutoridadElectoral)
    private readonly autoridadRepository: Repository<AutoridadElectoral>,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const nick = dto.nick.trim();
    const hash = await this.autogestionService.login(nick, dto.password);
    const usuario = await this.autogestionService.fetchUsuario(nick, hash);
    if (!usuario.persona) {
      throw new UnauthorizedException(
        'No se encontraron datos de persona para este usuario',
      );
    }
    const persona = usuario.persona;
    const sub = persona.legajo?.toString() ?? nick;
    const email = persona.email ?? persona.mail;
    const name = [persona.nombre, persona.apellido].filter(Boolean).join(' ');
    const autoridad = await this.autoridadRepository.findOne({
      where: { identificadorSso: nick },
    });
    const role = this.resolveJwtRole(autoridad);
    const payload: JwtPayload = {
      sub,
      role,
      email: email ?? undefined,
      name: name || undefined,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return {
      accessToken,
      user: {
        sub: payload.sub,
        role: payload.role,
        email: payload.email,
        name: payload.name,
      },
    };
  }

  private resolveJwtRole(autoridad: AutoridadElectoral | null): JwtRole {
    if (autoridad?.rol === RolAutoridad.ELECTION_ADMIN) {
      return JwtRole.ELECTION_ADMIN;
    }
    return JwtRole.VOTER;
  }
}
