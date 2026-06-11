import { cookies } from 'next/headers';

/**
 * Serialises the incoming request cookies into a `Cookie` header so a server
 * component can forward the session to the API on the user's behalf (ADR-0022 §5).
 * Centralised here so every gated read forwards the session the same way.
 */
export async function forwardedCookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');
}
