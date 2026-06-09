import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Locale, negotiateLocale } from '@toopo/i18n';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';

declare module 'fastify' {
  interface FastifyRequest {
    locale: Locale;
  }
}

@Injectable()
export class LocaleInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const header = request.headers['accept-language'];
    const overrideHeader = request.headers['x-toopo-locale'];
    const override = typeof overrideHeader === 'string' ? overrideHeader : null;
    const locale = negotiateLocale(typeof header === 'string' ? header : null, { override });
    request.locale = locale;
    reply.header('Content-Language', locale);

    return next.handle();
  }
}
