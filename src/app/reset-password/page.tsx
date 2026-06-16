"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Password strength calculation
  const strength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;
    return Math.min(score, 5);
  })();

  const strengthLabel = strength <= 1 ? "Weak" : strength <= 2 ? "Fair" : strength <= 3 ? "Good" : strength <= 4 ? "Strong" : "Very Strong";
  const strengthColor =
    strength <= 1 ? "bg-down" : strength <= 2 ? "bg-yellow-500" : strength <= 3 ? "bg-blue-500" : "bg-up";

  const isValid = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    // Client-side validation
    if (password.length < 8) { setError("Password must be at least 8 characters"); setLoading(false); return; }
    if (!/[A-Z]/.test(password)) { setError("Password must contain an uppercase letter"); setLoading(false); return; }
    if (!/[0-9]/.test(password)) { setError("Password must contain a number"); setLoading(false); return; }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) { setError("Password must contain a special character"); setLoading(false); return; }
    if (password !== confirm) { setError("Passwords do not match"); setLoading(false); return; }

    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Reset failed");
        return;
      }
      setInfo("Password changed successfully! Redirecting…");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-surface to-surface-2 px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 shadow-lg shadow-primary/20">
            <span className="text-xl font-black text-white">D</span>
            <span className="text-lg font-bold text-white">DARI SIR</span>
          </div>
          <p className="text-sm text-muted">NEPSE Live Market</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-lg">
          <h1 className="mb-1 text-xl font-bold text-center">Reset Password</h1>
          <p className="mb-4 text-center text-sm text-muted">Enter the reset code and your new password</p>

          {error && (
            <div className="mb-4 rounded-lg border border-down/20 bg-down-bg px-3 py-2 text-sm text-down">
              ⚠️ {error}
            </div>
          )}
          {info && (
            <div className="mb-4 rounded-lg border border-up/20 bg-up-bg px-3 py-2 text-sm text-up">
              ✅ {info}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Reset code */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Reset Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="••••••"
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-2xl font-black tracking-[0.4em] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* New password */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">New Password</label>
              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? "text" : "password"}
                  placeholder="Min 8 characters"
                  className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 pr-12 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted hover:text-foreground"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted">Strength</span>
                    <span className={`font-bold ${strength <= 1 ? "text-down" : strength <= 2 ? "text-yellow-500" : strength <= 3 ? "text-blue-500" : "text-up"}`}>
                      {strengthLabel}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full transition-all ${strengthColor}`}
                      style={{ width: `${(strength / 5) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Confirm Password</label>
              <div className="relative">
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  type={showConfirm ? "text" : "password"}
                  placeholder="Re-enter password"
                  className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 pr-12 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted hover:text-foreground"
                >
                  {showConfirm ? "Hide" : "Show"}
                </button>
              </div>
              {confirm && password !== confirm && (
                <p className="mt-1 text-xs text-down">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !isValid}
              className="w-full rounded-xl bg-primary py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Resetting…
                </span>
              ) : (
                "Reset Password & Log In"
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="w-full text-center text-sm text-muted transition hover:text-foreground"
            >
              ← Back to login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
