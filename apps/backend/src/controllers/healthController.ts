import { Request, Response } from "express";
import { healthCheck } from "../services/healthService";

export const getHealth = (req: Request, res: Response) => {
  const health = healthCheck();
  res.json(health);
};