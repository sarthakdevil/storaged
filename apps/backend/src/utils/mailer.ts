import nodemailer from "nodemailer";
import { logger } from "./logger";

type PasswordResetEmailInput = {
  to: string;
  name?: string | null;
  resetUrl: string;
};

const getMailFrom = () => {
  return process.env.MAIL_FROM ?? "Storaged <no-reply@storaged.local>";
};

const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn("SMTP env vars are missing; password reset emails will be logged locally.");
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user,
      pass,
    },
  });
};

const transporter = createTransporter();

export const sendPasswordResetEmail = async ({ to, name, resetUrl }: PasswordResetEmailInput) => {
  const from = getMailFrom();
  const subject = "Reset your Storaged password";
  const recipientName = name?.trim() || "there";

  const mail = {
    from,
    to,
    subject,
    text: [
      `Hi ${recipientName},`,
      "",
      "We received a request to reset your Storaged password.",
      `Use this link to create a new password: ${resetUrl}`,
      "",
      "This link expires in 1 hour.",
      "If you did not request this, you can safely ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <p>Hi ${recipientName},</p>
        <p>We received a request to reset your Storaged password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700">Reset password</a></p>
        <p style="word-break:break-all">If the button does not work, copy this link:<br/>${resetUrl}</p>
        <p>This link expires in 1 hour.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mail);

  logger.info("Password reset email prepared", {
    to,
    messageId: info.messageId,
  });

  return info;
};