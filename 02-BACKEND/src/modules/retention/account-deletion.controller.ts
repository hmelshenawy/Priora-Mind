import { Controller, Delete, HttpCode, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { EmailVerifiedGuard, JwtAuthGuard, type JwtPayload } from '../auth/auth.public';
import { AccountDeletionService } from './account-deletion.service';

/**
 * User-initiated account deletion (Consent §9, FR-031). DELETE /me/account is the
 * only surface for this flow; it is authenticated + EMAIL_VERIFIED (FR-002/FR-027).
 *
 * The endpoint NEVER returns answer/score/safety/consent contents — only a
 * sanitized `{ confirmation_id, status, completed }`. `completed: false` (status
 * `partial`) means stores are still being cleaned up and access is already
 * disabled; the user is NOT told deletion is complete (Consent §12). A retry
 * safely continues deleting remaining rows (idempotent ports).
 *
 * SECURITY: route guards are UX only (FR-028); the service enforces the deletion
 * contract and fail-closed semantics. No sensitive data is echoed or logged.
 */
@Controller()
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class AccountDeletionController {
  constructor(private readonly accountDeletion: AccountDeletionService) {}

  @Delete('me/account')
  @HttpCode(200)
  deleteAccount(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.accountDeletion.requestDeletion(user.sub);
  }
}
