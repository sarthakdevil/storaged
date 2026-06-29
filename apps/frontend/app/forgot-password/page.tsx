"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { HardDrive, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787/api";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const emailIsInvalid = email.length > 0 && !emailPattern.test(email);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!emailPattern.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? "Request failed");
      }

      setMessage(
        (data as { message?: string }).message ??
          "If an account exists for that email, a reset link has been sent.",
      );
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
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-subtitle">We&apos;ll email a secure reset link to your inbox.</p>

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}

          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`auth-input ${emailIsInvalid ? "auth-input-invalid" : ""}`}
                aria-invalid={emailIsInvalid}
              />
              {emailIsInvalid && (
                <p className="auth-hint auth-hint-error">Use a valid email format.</p>
              )}
            </div>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Sending link..." : "Send reset link"}
            </button>
          </form>

          <p className="auth-footer">
            Remembered your password? <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}