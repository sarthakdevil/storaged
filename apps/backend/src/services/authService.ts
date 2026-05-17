import { prisma } from "../utils/prisma";
import {
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from "../utils/auth";
import { sendPasswordResetEmail } from "../utils/mailer";
import { createHash, randomBytes } from "node:crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const DEFAULT_DRIVE_NAME = "My Drive";
const DEFAULT_APP_URL = "http://localhost:3000";

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

type PasswordResetRequestPayload = {
  email: string;
};

type PasswordResetPayload = {
  token: string;
  password: string;
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

const getAppUrl = () => {
  const baseUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? DEFAULT_APP_URL;
  return baseUrl.replace(/\/$/, "");
};

const hashResetToken = (token: string) => {
  return createHash("sha256").update(token).digest("hex");
};

const createPasswordResetToken = async (userId: string) => {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId,
      usedAt: null,
    },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
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

export const requestPasswordReset = async ({ email }: PasswordResetRequestPayload) => {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail)) {
    throw new AuthError("Please provide a valid email address.", 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    return {
      message: "If an account exists for that email, a reset link has been sent.",
    };
  }

  const { token } = await createPasswordResetToken(user.id);
  const resetUrl = new URL("/reset-password", getAppUrl());
  resetUrl.searchParams.set("token", token);
  resetUrl.searchParams.set("email", user.email);

  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl: resetUrl.toString(),
  });

  return {
    message: "If an account exists for that email, a reset link has been sent.",
  };
};

export const resetPassword = async ({ token, password }: PasswordResetPayload) => {
  if (!token) {
    throw new AuthError("Reset token is required.", 400);
  }

  if (!password || password.length < 8) {
    throw new AuthError("Password must be at least 8 characters long.", 400);
  }

  const tokenHash = hashResetToken(token);
  const now = new Date();

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
    throw new AuthError("This reset link is invalid or has expired.", 400);
  }

  const hashedPassword = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    await tx.session.deleteMany({
      where: { userId: resetToken.userId },
    });

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: now },
    });
  });

  return {
    message: "Your password has been reset. Please sign in again.",
  };
};
