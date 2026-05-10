import { prisma } from "../utils/prisma";
import {
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from "../utils/auth";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DRIVE_NAME = "My Drive";

type AuthPayload = {
  email: string;
  password: string;
  name?: string;
  ipAddress?: string;
  userAgent?: string;
};

type LogoutPayload = {
  token: string;
};

class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const sanitizeName = (name?: string) => {
  const trimmedName = name?.trim();
  return trimmedName ? trimmedName : null;
};

const validateEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const createSession = async ({
  userId,
  ipAddress,
  userAgent,
}: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return session;
};

export const registerUser = async ({
  email,
  password,
  name,
  ipAddress,
  userAgent,
}: AuthPayload) => {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail)) {
    throw new AuthError("Please provide a valid email address.", 400);
  }

  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters long.", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new AuthError("An account with this email already exists.", 409);
  }

  const hashedPassword = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        name: sanitizeName(name),
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    await tx.drive.create({
      data: {
        ownerId: user.id,
        name: DEFAULT_DRIVE_NAME,
      },
    });

    const session = await tx.session.create({
      data: {
        userId: user.id,
        token: generateSessionToken(),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ipAddress,
        userAgent,
      },
      select: {
        token: true,
        expiresAt: true,
      },
    });

    return { user, session };
  });

  return result;
};

export const loginUser = async ({
  email,
  password,
  ipAddress,
  userAgent,
}: AuthPayload) => {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail)) {
    throw new AuthError("Please provide a valid email address.", 400);
  }

  if (!password) {
    throw new AuthError("Password is required.", 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AuthError("Invalid email or password.", 401);
  }

  const passwordMatches = await verifyPassword(password, user.password);

  if (!passwordMatches) {
    throw new AuthError("Invalid email or password.", 401);
  }

  const session = await createSession({
    userId: user.id,
    ipAddress,
    userAgent,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
    session: {
      token: session.token,
      expiresAt: session.expiresAt,
    },
  };
};

export const logoutUser = async ({ token }: LogoutPayload) => {
  if (!token) {
    throw new AuthError("Authorization token is required.", 401);
  }

  const deletedSession = await prisma.session.deleteMany({
    where: { token },
  });

  if (deletedSession.count === 0) {
    throw new AuthError("Session not found or already logged out.", 404);
  }

  return {
    success: true,
  };
};

export const isAuthError = (error: unknown): error is AuthError => {
  return error instanceof AuthError;
};
