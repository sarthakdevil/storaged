import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import { logger } from "./utils/logger";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import storageRoutes from "./routes/storageRoutes";
import apiKeyRoutes from "./routes/apiKeyRoutes";
import v1Routes from "./routes/v1Routes";
import uploadRoutes from "./routes/uploadRoutes";

export const app = express();

app.use(cors());
app.use(
  morgan(
    ':date[iso] :remote-addr ":method :url HTTP/:http-version" :status :res[content-length] - :response-time ms ":referrer" ":user-agent"',
    {
      stream: {
        write: (message) => logger.info(message.trimEnd()),
      },
    }
  )
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));

app.disable("x-powered-by");

app.use((req, res, next) => {
  if (req.path.endsWith("/") && req.path.length > 1) {
    const newPath = req.path.slice(0, -1);
    res.redirect(newPath);
  } else {
    next();
  }
});

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", storageRoutes);
app.use("/api", uploadRoutes);
app.use("/api", apiKeyRoutes);
app.use("/api/v1", v1Routes);

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const statusCodeRaw = (err as { statusCode?: unknown; status?: unknown } | null)?.statusCode;
  const statusRaw = (err as { statusCode?: unknown; status?: unknown } | null)?.status;
  const statusCode =
    typeof statusCodeRaw === "number"
      ? statusCodeRaw
      : typeof statusRaw === "number"
        ? statusRaw
        : 500;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error("Request error", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    message,
    stack,
  });

  if (res.headersSent) {
    next(err);
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const body = isProd && statusCode >= 500 ? { error: "Internal Server Error" } : { error: message };
  res.status(statusCode).json(body);
});
