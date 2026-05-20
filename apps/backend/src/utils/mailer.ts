import nodemailer from "nodemailer";
import { logger } from "./logger";

type PasswordResetEmailInput = {
  to: string;
  name?: string | null;
  resetUrl: string;
};

let transporter: nodemailer.Transporter | null = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  const testAccount = await nodemailer.createTestAccount();

  logger.info("Ethereal test account created", { user: testAccount.user });

  transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return transporter;
};

export const sendPasswordResetEmail = async ({ to, name, resetUrl }: PasswordResetEmailInput) => {
  const t = await getTransporter();
  const recipientName = name?.trim() || "there";

  const info = await t.sendMail({
    from: '"Storaged" <no-reply@storaged.local>',
    to,
    subject: "Reset your Storaged password",
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
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  logger.info("Password reset email sent", {
    to,
    messageId: info.messageId,
    previewUrl,
  });

  return { messageId: info.messageId, previewUrl };
};
