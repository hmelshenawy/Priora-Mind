import { HttpException, HttpStatus } from '@nestjs/common';

export class PlanUnavailableException extends HttpException {
  constructor(extra: Record<string, unknown> = {}) {
    super({ error: { code: 'PLAN_UNAVAILABLE', ...extra } }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export class NoCurrentPlanException extends HttpException {
  constructor() {
    super({ error: { code: 'PLAN_NOT_FOUND', startable: true } }, HttpStatus.NOT_FOUND);
  }
}

export class PlanNotReadyException extends HttpException {
  constructor() {
    super({ error: { code: 'PLAN_NOT_READY' } }, HttpStatus.CONFLICT);
  }
}

export class PlanNotActiveException extends HttpException {
  constructor() {
    super({ error: { code: 'PLAN_NOT_ACTIVE' } }, HttpStatus.CONFLICT);
  }
}

export class ActionResultNotFoundException extends HttpException {
  constructor() {
    super({ error: { code: 'ACTION_NOT_FOUND' } }, HttpStatus.NOT_FOUND);
  }
}

export class ActionConflictException extends HttpException {
  constructor() {
    super({ error: { code: 'ACTION_CONFLICT' } }, HttpStatus.CONFLICT);
  }
}

export class SafetyHoldException extends HttpException {
  constructor(extra: Record<string, unknown> = {}) {
    super({ error: { code: 'SAFETY_HOLD', ...extra } }, HttpStatus.CONFLICT);
  }
}
