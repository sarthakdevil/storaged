import express from "express";
import cors from "cors";
import morgan from "morgan";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import storageRoutes from "./routes/storageRoutes";

export const app = express();

app.use(cors());
app.use(morgan("tiny"));
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
