import { cookies } from 'next/headers';
import { Env } from '../../env';

export interface ServerSessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServerSession {
  readonly id: string;
  readonly expiresAt: string;
  readonly token: string;
  readonly userId: string;
  /** The viewer's active organization = active Workspace (ADR-0028, org plugin). */
  readonly activeOrganizationId?: string | null;
}

export interface ServerSessionResponse {
  readonly user: ServerSessionUser;
  readonly session: ServerSession;
}

export async function getServerSession(): Promise<ServerSessionResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');
  if (cookieHeader.length === 0) {
    return null;
  }

  try {
    const response = await fetch(`${Env.NEXT_PUBLIC_AUTH_URL}/v1/auth/get-session`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const data: unknown = await response.json();
    if (data === null || typeof data !== 'object') {
      return null;
    }
    const candidate = data as Partial<ServerSessionResponse>;
    if (candidate.user === undefined || candidate.session === undefined) {
      return null;
    }
    return candidate as ServerSessionResponse;
  } catch {
    return null;
  }
}
