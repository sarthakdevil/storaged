// ─── Auth types ───────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

export type SessionToken = {
  token: string;
  expiresAt: string;
};

export type AuthResponse = {
  user: AuthUser;
  session: SessionToken;
};

export type ShareLink = {
  id: string;
  token: string;
  nodeId: string;
  expiresAt: string | null;
  createdAt: string;
};

export type ApiKey = {
  id: string;
  name: string;
  /** First 14 chars of the key — safe to display */
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CreatedApiKey = ApiKey & {
  /** Full raw key — only returned on creation, never again */
  key: string;
};
