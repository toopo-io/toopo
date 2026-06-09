import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { routes } from './lib/routes';
import { isProtectedPath } from './proxy.helpers';

const intlMiddleware = createMiddleware(routing);

const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

const SUPPORTED_LOCALE_SET: ReadonlySet<string> = new Set<string>([...routing.locales]);

function stripLocale(pathname: string): { locale: string | null; pathAfterLocale: string } {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const first = segments[0];
  if (first !== undefined && SUPPORTED_LOCALE_SET.has(first)) {
    return {
      locale: first,
      pathAfterLocale: `/${segments.slice(1).join('/')}`,
    };
  }
  return { locale: null, pathAfterLocale: pathname };
}

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const { locale, pathAfterLocale } = stripLocale(pathname);

  if (locale !== null && isProtectedPath(pathAfterLocale) && !hasSessionCookie(request)) {
    const signinUrl = request.nextUrl.clone();
    signinUrl.pathname = routes.signin(locale);
    signinUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(signinUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: '/((?!_next|api|.*\\..*).*)',
};
