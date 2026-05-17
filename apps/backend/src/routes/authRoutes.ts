import { Router } from "express";
import {
	forgotPassword,
	login,
	logout,
	register,
	resetUserPassword,
} from "../controllers/authController";

const router = Router();

router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetUserPassword);

export default router;
