"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HardDrive, Loader2, Eye, EyeOff } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type ResetPasswordFormProps = {
  token: string;
  email: string;
};

export function ResetPasswordForm({ token, email }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const passwordIsValid = useMemo(() => password.length >= 8, [password]);
  const passwordsDoNotMatch = confirmPassword.length > 0 && password !== confirmPassword;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }

    if (!passwordIsValid) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? "Request failed");
      }

      setMessage(
        (data as { message?: string }).message ?? "Your password has been reset successfully.",
      );
      setTimeout(() => router.push("/login"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="auth-brand-mark" aria-hidden="true">
            <HardDrive size={21} />
          </div>
          <span className="auth-brand-name">Storaged</span>
        </div>

        <div className="auth-card">
          <h1 className="auth-title">Set a new password</h1>
          <p className="auth-subtitle">
            {email ? `Resetting password for ${email}` : "Choose a strong new password for your account."}
          </p>

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}

          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="password">
                New password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className={`auth-input auth-password-input ${
                    password.length > 0 && !passwordIsValid ? "auth-input-invalid" : ""
                  }`}
                  aria-invalid={password.length > 0 && !passwordIsValid}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="auth-icon-button"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="confirmPassword"
                  type={showConfirmPw ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className={`auth-input auth-password-input ${
                    passwordsDoNotMatch ? "auth-input-invalid" : ""
                  }`}
                  aria-invalid={passwordsDoNotMatch}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="auth-icon-button"
                  aria-label={showConfirmPw ? "Hide password" : "Show password"}
                >
                  {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordsDoNotMatch && (
                <p className="auth-hint auth-hint-error">Passwords must match.</p>
              )}
            </div>

            <button type="submit" disabled={loading || !token} className="auth-submit">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Updating password..." : "Reset password"}
            </button>
          </form>

          <p className="auth-footer">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}