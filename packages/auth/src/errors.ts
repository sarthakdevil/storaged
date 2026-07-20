// ─── Auth errors ─────────────────────────────────────────────────────────────

export class AuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
