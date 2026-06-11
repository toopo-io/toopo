/**
 * Bridges Fastify ↔ Better Auth. The auth handler is registered directly on
 * the underlying Fastify instance (not as a Nest controller) because Better
 * Auth ships a Web-Fetch `Request → Response` handler, not a Nest decorator
 * surface. The downside is that Nest's APP_FILTER chain does NOT see errors
 * thrown here, so this module reproduces the GlobalExceptionFilter envelope
 * locally. See Phase 4.1 bug B2.
 */
import { HttpStatus, type RawBodyRequest } from '@nestjs/common';
import { ErrorCode, type ErrorResponse } from '@toopo/api-contracts';
import { type Locale, negotiateLocale } from '@toopo/i18n';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'nestjs-pino';
import type { I18nService } from '../../i18n/i18n.service';
import type { Auth } from './auth.factory';

const AUTH_STATUS_TO_CODE = new Map<number, ErrorCode>([
  [HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED],
  [HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED],
  [HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN],
  [HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND],
  [HttpStatus.CONFLICT, ErrorCode.CONFLICT],
  [HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED],
  [HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE],
]);

const CODE_TO_I18N_KEY: Readonly<Record<ErrorCode, string>> = {
  [ErrorCode.VALIDATION_FAILED]: 'errors.validation.failed',
  [ErrorCode.UNAUTHORIZED]: 'errors.unauthorized',
  [ErrorCode.FORBIDDEN]: 'errors.forbidden',
  [ErrorCode.NOT_FOUND]: 'errors.not_found',
  [ErrorCode.CONFLICT]: 'errors.conflict',
  [ErrorCode.RATE_LIMITED]: 'errors.rate_limited',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'errors.service_unavailable',
  [ErrorCode.INTERNAL]: 'errors.internal',
};

function resolveLocale(acceptLanguage: string | null, localeOverride: string | null): Locale {
  return negotiateLocale(acceptLanguage, { override: localeOverride });
}

function pickAcceptLanguage(request: FastifyRequest): string | null {
  const value = request.headers['accept-language'];
  return typeof value === 'string' ? value : null;
}

export function pickLocaleOverride(request: FastifyRequest): string | null {
  const value = request.headers['x-toopo-locale'];
  return typeof value === 'string' ? value : null;
}

export function buildAuthErrorResponse(
  status: number,
  requestId: string,
  acceptLanguage: string | null,
  i18n: Pick<I18nService, 'translate'>,
  localeOverride: string | null = null,
): ErrorResponse {
  const code =
    status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? ErrorCode.INTERNAL
      : (AUTH_STATUS_TO_CODE.get(status) ?? ErrorCode.INTERNAL);
  return {
    code,
    message: i18n.translate(resolveLocale(acceptLanguage, localeOverride), CODE_TO_I18N_KEY[code]),
    requestId,
  };
}

interface RegisterAuthRouteDeps {
  readonly fastify: FastifyInstance;
  readonly auth: Auth;
  readonly logger: Logger;
  readonly i18n: I18nService;
  readonly portFallback: number;
}

export function registerAuthRoute(deps: RegisterAuthRouteDeps): void {
  const { fastify, auth, logger, i18n, portFallback } = deps;

  fastify.route({
    method: ['GET', 'POST'],
    url: '/v1/auth/*',
    async handler(request: RawBodyRequest<FastifyRequest>, reply: FastifyReply) {
      try {
        const host = request.headers.host ?? `localhost:${portFallback}`;
        const url = new URL(request.url, `http://${host}`);
        const headers = fromNodeHeaders(request.headers);
        const init: RequestInit = {
          method: request.method,
          headers,
        };
        // Forward the EXACT bytes the client sent. This route is registered
        // directly on Fastify (Better Auth ships a Web-Fetch handler, not a Nest
        // surface), so Nest's body pipeline does not populate `request.body`
        // here — only the raw-body capture (`rawBody: true`, main.ts) does.
        // Re-serialising `request.body` would forward `undefined` and Better Auth
        // would reject every field as missing; the raw buffer is the faithful
        // source and matches the content-type/length headers copied above. The
        // `request.body` branch remains a fallback for any in-process `inject()`
        // caller, where the raw body is not captured but `body` is parsed.
        const { rawBody } = request;
        if (rawBody !== undefined && rawBody.length > 0) {
          init.body = new Uint8Array(rawBody);
        } else if (request.body !== undefined && request.body !== null) {
          init.body = JSON.stringify(request.body);
        }
        const webRequest = new Request(url.toString(), init);
        const response = await auth.handler(webRequest);

        reply.status(response.status);
        for (const cookie of response.headers.getSetCookie()) {
          reply.header('set-cookie', cookie);
        }
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'set-cookie') {
            reply.header(key, value);
          }
        });

        // Better Auth occasionally produces a Response with null body on
        // a non-2xx status (e.g. an unmapped internal exception). Replace
        // the bare null with a canonical ErrorResponse envelope so clients
        // never receive a literal `null` body. See B2.
        if (response.body === null && response.status >= HttpStatus.BAD_REQUEST) {
          logger.error(
            {
              requestId: request.id,
              status: response.status,
              method: request.method,
              url: request.url,
            },
            'auth: handler returned non-2xx with null body',
          );
          reply.header('content-type', 'application/json; charset=utf-8');
          return reply.send(
            buildAuthErrorResponse(
              response.status,
              request.id,
              pickAcceptLanguage(request),
              i18n,
              pickLocaleOverride(request),
            ),
          );
        }

        return reply.send(response.body !== null ? await response.text() : null);
      } catch (error) {
        // Thrown exceptions bypass Nest's GlobalExceptionFilter because this
        // route is registered directly on Fastify. Mirror the filter's
        // INTERNAL envelope locally.
        logger.error(
          {
            err: error,
            requestId: request.id,
            method: request.method,
            url: request.url,
          },
          'auth: handler threw',
        );
        reply.status(HttpStatus.INTERNAL_SERVER_ERROR);
        reply.header('content-type', 'application/json; charset=utf-8');
        return reply.send(
          buildAuthErrorResponse(
            HttpStatus.INTERNAL_SERVER_ERROR,
            request.id,
            pickAcceptLanguage(request),
            i18n,
            pickLocaleOverride(request),
          ),
        );
      }
    },
  });
}
