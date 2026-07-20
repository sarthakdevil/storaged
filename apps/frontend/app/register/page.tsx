"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HardDrive, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@repo/ui";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordChecks(password: string) {
  return [
    { label: "8+ characters", passed: password.length >= 8 },
    { label: "Uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "Lowercase letter", passed: /[a-z]/.test(password) },
    { label: "Number", passed: /\d/.test(password) },
    { label: "Symbol", passed: /[^A-Za-z0-9]/.test(password) },
  ];
}

function getStrength(score: number) {
  if (score <= 1) return { label: "Weak", className: "strength-weak", width: "20%" };
  if (score <= 3) return { label: "Good", className: "strength-good", width: "60%" };
  return { label: "Strong", className: "strength-strong", width: "100%" };
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailIsInvalid = email.length > 0 && !emailPattern.test(email);
  const passwordChecks = getPasswordChecks(password);
  const passwordScore = passwordChecks.filter((check) => check.passed).length;
  const strength = getStrength(passwordScore);
  const passwordIsValid = passwordChecks.every((check) => check.passed);
  const passwordsDoNotMatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!emailPattern.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!passwordIsValid) {
      setError("Use a stronger password that matches every requirement.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name || undefined);
      router.push("/drive");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
          <h1 className="auth-title">Create account</h1>
          <p className="auth-subtitle">Start storing files for free</p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="name">
                Name <span className="auth-label-note">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="auth-input"
              />
            </div>

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

            <div className="auth-field">
              <label className="auth-label" htmlFor="password">
                Password
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
              {password.length > 0 && (
                <div className="password-strength">
                  <div className="strength-header">
                    <span>Password strength</span>
                    <div className="strength-score">
                      <strong className={strength.className}>{strength.label}</strong>
                      <span>{passwordScore}/5 points</span>
                    </div>
                  </div>
                  <div className="strength-track" aria-hidden="true">
                    <span
                      className={`strength-fill ${strength.className}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <div className="password-rules">
                    {passwordChecks.map((check) => (
                      <span
                        key={check.label}
                        className={check.passed ? "password-rule-passed" : ""}
                      >
                        {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirmPassword">
                Confirm password
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

            <button type="submit" disabled={loading} className="auth-submit">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
