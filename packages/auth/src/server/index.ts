/**
 * Server auth entrypoint (imported ONLY by the API app). This will export
 * the DB-backed Better Auth instance in the auth-core slice. Ticket 01
 * implements no product auth: importing the factory throws at runtime, and
 * a lint boundary + CI check keep the web app from importing this
 * entrypoint at all.
 */
export class AuthNotImplementedError extends Error {
  constructor() {
    super("auth server is not implemented until the auth-core slice (ticket 03)");
    this.name = "AuthNotImplementedError";
  }
}

export function createBetterAuthInstance(): never {
  throw new AuthNotImplementedError();
}
