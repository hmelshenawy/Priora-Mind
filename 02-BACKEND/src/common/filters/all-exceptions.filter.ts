import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';

/**
 * Global exception filter (FR-037, FR-030).
 *
 * - Never echoes the submitted request body or sensitive path/params.
 * - Maps HttpException → its status + safe response shape.
 * - Maps ZodError → 400 `VALIDATION` with field paths (no values).
 * - Maps everything else → 500 `INTERNAL` with no stack/message leak to the
 *   client; the redacted context is logged server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: unknown = { error: { code: 'INTERNAL' } };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      body = typeof response === 'string' ? { error: { code: 'ERROR', message: response } } : response;
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      body = {
        error: {
          code: 'VALIDATION',
          fields: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
    } else {
      // Log only non-sensitive context; never the request body.
      this.logger.error(
        `Unhandled exception on ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (!res.headersSent) {
      res.status(status).json(body);
    }
  }
}