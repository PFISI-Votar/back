import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class VoterJwtAuthGuard extends AuthGuard('voter-jwt') {}
