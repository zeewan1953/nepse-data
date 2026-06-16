"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp" | "forgot" | "reset-code">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function post(url: string, payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Something went wrong");
        return null;
      }
      return j;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitLogin(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/login", { email, password });
    if (!j) return;
    if (j.needOtp) {
      setStep("otp");
      if (j.devCode) setDevCode(j.devCode);
      setInfo(j.devCode ? "Email not configured — use code below" : `OTP sent to ${email}`);
    } else if (j.ok) {
      router.push("/");
      router.refresh();
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/verify-otp", { email, code });
    if (j?.ok) {
      router.push("/");
      router.refresh();
    }
  }

  async function resend() {
    const j = await post("/api/auth/resend-otp", { email });
    if (j) {
      if (j.devCode) setDevCode(j.devCode);
      if (j.cooldown) {
        setError(`Please wait ${j.cooldown}s before requesting again`);
      } else {
        setInfo("New OTP sent to your email");
      }
    }
  }

  async function onSubmitForgot(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/forgot-password", { email });
    if (j) {
      if (j.devCode) {
        setDevCode(j.devCode);
        setInfo("Email not configured — use code below");
      } else {
        setInfo(`Reset code sent to ${email}`);
      }
      setStep("reset-code");
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
          {devCode && step === "otp" && (
            <button
              type="button"
              onClick={() => setCode(devCode)}
              className="mb-4 block w-full rounded-xl border-2 border-dashed border-primary bg-surface-2 px-4 py-3 text-center transition hover:bg-primary/5"
            >
              <span className="text-xs text-muted">Development — tap to fill:</span>
              <div className="mt-1 text-3xl font-black tracking-[0.3em] text-primary">{devCode}</div>
            </button>
          )}

          {/* EMAIL + PASSWORD STEP */}
          {step === "email" && (
            <form onSubmit={onSubmitLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                disabled={loading || !email || !password}
                className="w-full rounded-xl bg-primary py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Logging in…
                  </span>
                ) : (
                  "Log In"
                )}
              </button>
              <button
                type="button"
                onClick={() => { setStep("forgot"); setError(null); setInfo(null); }}
                className="w-full text-center text-sm font-medium text-primary transition hover:underline"
              >
                Forgot password?
              </button>
            </form>
          )}

          {/* OTP STEP */}
          {step === "otp" && (
            <form onSubmit={onSubmitOtp} className="space-y-4">
              <p className="text-center text-sm text-muted">Enter the 6-digit code sent to <b>{email}</b></p>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted text-center">Verification Code</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoFocus
                  placeholder="••••••"
                  className="w-full rounded-xl border border-border bg-surface-2 px-4 py-4 text-center text-2xl font-black tracking-[0.4em] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                disabled={loading || code.length < 6}
                className="w-full rounded-xl bg-primary py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Verifying…
                  </span>
                ) : (
                  "Verify & Continue"
                )}
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={loading}
                className="w-full text-center text-sm font-medium text-primary transition hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); setError(null); setInfo(null); }}
                className="w-full text-center text-sm text-muted transition hover:text-foreground"
              >
                ← Back to login
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD STEP */}
          {step === "forgot" && (
            <form onSubmit={onSubmitForgot} className="space-y-4">
              <p className="text-center text-sm text-muted">Enter your email and we&apos;ll send a reset code</p>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                disabled={loading || !email}
                className="w-full rounded-xl bg-primary py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Sending…
                  </span>
                ) : (
                  "Send Reset Code"
                )}
              </button>
              <button
                type="button"
                onClick={() => { setStep("email"); setError(null); setInfo(null); }}
                className="w-full text-center text-sm text-muted transition hover:text-foreground"
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-primary transition hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
