/**
 * Client auth entrypoint (imported by the web app). Exports shared session
 * types and a typed session client that calls the internal API — the web
 * app never imports the DB-backed auth instance (see `@myform/auth/server`)
 * and never receives auth secrets.
 */

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface SessionWorkspace {
  id: string;
  name: string;
  role: string;
}

export interface AuthSession {
  user: SessionUser;
  workspace: SessionWorkspace | null;
}

export interface FetchSessionOptions {
  /** Base URL of the internal API, e.g. http://127.0.0.1:4000 */
  baseUrl: string;
  /** Incoming `Cookie` header value, forwarded for session validation. */
  cookie: string;
  fetchImpl?: typeof fetch;
}

/**
 * Validate the browser session through `GET /v1/auth/session`, forwarding
 * the incoming cookie. Returns `null` for invalid/expired sessions (401).
 * Server components wrap this in React `cache()` at the call site.
 */
export async function fetchSession(options: FetchSessionOptions): Promise<AuthSession | null> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${options.baseUrl}/v1/auth/session`, {
    headers: { cookie: options.cookie },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (response.status === 200) return (await response.json()) as AuthSession;
  throw new Error(`session endpoint returned unexpected status ${response.status}`);
}
