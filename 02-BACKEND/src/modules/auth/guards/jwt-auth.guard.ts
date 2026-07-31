import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard requiring a valid access token (Passport 'jwt' strategy).
 * Backend-enforced on every protected route; frontend route guards are a UX
 * convenience only and NOT a security boundary (FR-027/FR-028, plan.md).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}