import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ErrorCode, type ErrorResponse } from '@toopo/api-contracts';
import { InvalidCursorError } from '@toopo/db';
import { type Locale, negotiateLocale } from '@toopo/i18n';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { I18nService } from '../../i18n/i18n.service';
import { translateFlattenedZodError } from '../../i18n/zod-flatten-translator';
import { translateZodIssue } from '../../i18n/zod-issue.translator';
import { ERROR_CODE_TO_I18N_KEY, STATUS_TO_ERROR_CODE } from '../errors/error-code-maps';

function resolveLocaleFromHeader(request: FastifyRequest): Locale {
  const header = request.headers['accept-language'];
  const overrideHeader = request.headers['x-toopo-locale'];
  const override = typeof overrideHeader === 'string' ? overrideHeader : null;
  return negotiateLocale(typeof header === 'string' ? header : null, { override });
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: Logger,
    private readonly i18n: I18nService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    // `request.locale` is set by `LocaleInterceptor`, but Nest runs guards
    // BEFORE interceptors — so a guard-thrown UnauthorizedException reaches
    // this filter while `request.locale` is still undefined. Without the
    // explicit Accept-Language re-negotiation below, all guard-thrown
    // errors would return their messages in the default locale regardless
    // of the client's request. See Phase 4.1.6 finding B8.
    const locale: Locale = request.locale ?? resolveLocaleFromHeader(request);

    const { status, body } = this.normalize(exception, request, locale);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, requestId: request.id }, 'Unhandled error');
    } else {
      this.logger.warn({ code: body.code, requestId: request.id }, body.message);
    }

    response.status(status).send(body);
  }

  private normalize(
    exception: unknown,
    request: FastifyRequest,
    locale: Locale,
  ): { status: number; body: ErrorResponse } {
    if (exception instanceof InvalidCursorError) {
      // An untrusted, malformed pagination cursor (ADR-0020 Fork 4) is client
      // error, not a server fault — surface it as a 400, never a 500.
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: ErrorCode.VALIDATION_FAILED,
          message: this.i18n.translate(locale, ERROR_CODE_TO_I18N_KEY[ErrorCode.VALIDATION_FAILED]),
          requestId: request.id,
        },
      };
    }

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as z.ZodError;
      const first = zodError.issues[0];
      const translated =
        first !== undefined
          ? translateZodIssue(first)
          : { key: 'errors.validation.failed', params: { path: 'value' } };
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: ErrorCode.VALIDATION_FAILED,
          message: this.i18n.translate(locale, translated.key, translated.params),
          params: translated.params,
          requestId: request.id,
          details: translateFlattenedZodError(zodError, locale, this.i18n),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_ERROR_CODE.get(status) ?? ErrorCode.INTERNAL;
      return {
        status,
        body: {
          code,
          message: this.i18n.translate(locale, ERROR_CODE_TO_I18N_KEY[code]),
          requestId: request.id,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL,
        message: this.i18n.translate(locale, 'errors.internal'),
        requestId: request.id,
      },
    };
  }
}
