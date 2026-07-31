import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../tokens/jwt-token.service';

/**
 * Route guard: requires the authenticated user's account status to be
 * EMAIL_VERIFIED (FR-002, contracts/consent.md "All protected routes require a
 * valid access token + EMAIL_VERIFIED"). Stacks AFTER `JwtAuthGuard` so
 * `request.user` is the decoded payload. A REGISTERED user with a valid access
 * token is rejected with 403 EMAIL_NOT_VERIFIED — backend-enforced, not a UX
 * guard (FR-027/FR-028).
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user as JwtPayload | undefined;
    if (!user || user.status !== 'EMAIL_VERIFIED') {
      throw new HttpException({ error: { code: 'EMAIL_NOT_VERIFIED' } }, HttpStatus.FORBIDDEN);
    }
    return true;
  }
}