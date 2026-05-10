import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prisma";

export type AuthenticatedRequest = Request & {
  userId: string;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authorization token is required." });
    return;
  }

  const token = authHeader.slice(7);

  const session = await prisma.session.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true },
  });

  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ message: "Session expired or invalid." });
    return;
  }

  (req as AuthenticatedRequest).userId = session.userId;
  next();
};
