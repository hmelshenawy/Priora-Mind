import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Validation pipe backed by Zod (plan.md Technical Context; FR-037).
 * Throws a BadRequest carrying a machine-readable `VALIDATION` error code and
 * the offending field paths — never the submitted value itself. Controllers
 * instantiate it per-route with the relevant DTO schema:
 *   `@Body(new ZodValidationPipe(MySchema))`.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestValidation(error);
      }
      throw error;
    }
  }
}

import { BadRequestException } from '@nestjs/common';

/** BadRequestException with a stable VALIDATION error shape (no payload echo). */
export class BadRequestValidation extends BadRequestException {
  constructor(error: ZodError) {
    super({
      error: {
        code: 'VALIDATION',
        fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
}