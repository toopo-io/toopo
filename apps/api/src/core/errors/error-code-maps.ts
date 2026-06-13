/**
 * The single source of truth for the API's error taxonomy mapping: HTTP status →
 * `ErrorCode`, and `ErrorCode` → i18n message key. Shared by the Nest
 * `GlobalExceptionFilter` and the Better Auth Fastify bridge — the bridge sits
 * outside Nest's APP_FILTER chain (Better Auth ships a Web-Fetch handler, not a
 * Nest surface) yet must emit the exact same `ErrorResponse` envelope, so the
 * maps live here where both can import them and never skew.
 */
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@toopo/api-contracts';

export const STATUS_TO_ERROR_CODE: ReadonlyMap<number, ErrorCode> = new Map([
  [HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED],
  [HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED],
  [HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN],
  [HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND],
  [HttpStatus.CONFLICT, ErrorCode.CONFLICT],
  [HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED],
  [HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE],
]);

export const ERROR_CODE_TO_I18N_KEY: Readonly<Record<ErrorCode, string>> = {
  [ErrorCode.VALIDATION_FAILED]: 'errors.validation.failed',
  [ErrorCode.UNAUTHORIZED]: 'errors.unauthorized',
  [ErrorCode.FORBIDDEN]: 'errors.forbidden',
  [ErrorCode.NOT_FOUND]: 'errors.not_found',
  [ErrorCode.CONFLICT]: 'errors.conflict',
  [ErrorCode.RATE_LIMITED]: 'errors.rate_limited',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'errors.service_unavailable',
  [ErrorCode.INTERNAL]: 'errors.internal',
};
