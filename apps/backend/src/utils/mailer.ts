import { Resend } from "resend";
import { logger } from "./logger";
import { getRuntimeValue } from "./runtimeEnv";

type PasswordResetEmailInput = {
  to: string;
  name?: string | null;
  resetUrl: string;
};

let resend: Resend | null = null;
let resendKey: string | undefined;

const getResend = () => {
  const key = getRuntimeValue("RESEND_KEY");

  if (!key) {
    throw new Error("RESEND_KEY is required to send email.");
  }

  if (!resend || resendKey !== key) {
    resend = new Resend(key);
    resendKey = key;
  }

  return resend;
};

export const sendPasswordResetEmail = async ({ to, name, resetUrl }: PasswordResetEmailInput) => {
  const recipientName = name?.trim() || "there";

  const { data, error } = await getResend().emails.send({
    from: "onboarding@resend.dev",
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

  if (error) {
    logger.error("Failed to send password reset email", { to, error });
    throw new Error(error.message);
  }

  console.log(`Password reset email sent to: ${to} | Message ID: ${data?.id}`);
  logger.info("Password reset email sent", { to, messageId: data?.id });

  return data;
};
