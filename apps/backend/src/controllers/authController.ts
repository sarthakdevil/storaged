import { Request, Response } from "express";
import {
  isAuthError,
  loginUser,
  logoutUser,
  registerUser,
} from "../services/authService";

const getRequestMeta = (req: Request) => ({
  ipAddress: req.ip,
  userAgent: req.get("user-agent") ?? undefined,
});

const getBearerToken = (req: Request) => {
  const authHeader = req.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.slice("Bearer ".length).trim();
};

const handleAuthError = (error: unknown, res: Response) => {
  if (isAuthError(error)) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: "Something went wrong." });
};

export const register = async (req: Request, res: Response) => {
  try {
    const result = await registerUser({
      email: req.body.email ?? "",
      password: req.body.password ?? "",
      name: req.body.name,
      ...getRequestMeta(req),
    });

    res.status(201).json(result);
  } catch (error) {
    handleAuthError(error, res);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const result = await loginUser({
      email: req.body.email ?? "",
      password: req.body.password ?? "",
      ...getRequestMeta(req),
    });

    res.status(200).json(result);
  } catch (error) {
    handleAuthError(error, res);
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const result = await logoutUser({
      token: getBearerToken(req),
    });

    res.status(200).json(result);
  } catch (error) {
    handleAuthError(error, res);
  }
};
