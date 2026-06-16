"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Mode = "login" | "signup" | "otp" | "forgot" | "reset";

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
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

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    const url = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const j = await post(url, { email, password, mobile, name });
    if (!j) return;
    if (j.needOtp) {
      setMode("otp");
      setInfo("A verification code has been sent to your email address.");
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
    const url = mode === "reset" ? "/api/auth/forgot-password" : "/api/auth/resend-otp";
    const j = await post(url, { email });
    if (j) {
      setInfo("A new verification code has been sent to your email.");
    }
  }

  async function onSubmitForgot(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/forgot-password", { email });
    if (j?.needReset) {
      setMode("reset");
      setInfo("A reset code has been sent to your email address.");
    }
  }

  async function onSubmitReset(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/reset-password", { email, code, password });
    if (j?.ok) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-white">D</span>
          <span className="text-xl font-extrabold">DARI SIR</span>
        </div>
        <h1 className="mb-4 text-lg font-bold">
          {mode === "signup"
            ? "Create your account"
            : mode === "login"
              ? "Welcome back"
              : mode === "otp"
                ? "Verify your email"
                : mode === "forgot"
                  ? "Forgot password"
                  : "Set a new password"}
        </h1>

        {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-sm text-down">{error}</div>}
        {info && <div className="mb-3 rounded-lg bg-up-bg px-3 py-2 text-sm text-up">{info}</div>}

        {mode === "otp" ? (
          <form onSubmit={onSubmitOtp} className="space-y-3">
            <Field label="6-digit code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="------"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-primary"
              />
            </Field>
            <button disabled={loading || code.length < 6} className="w-full rounded-lg bg-primary py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
            <button type="button" onClick={resend} disabled={loading} className="w-full text-sm text-primary hover:underline">
              Resend code
            </button>
          </form>
        ) : mode === "forgot" ? (
          <form onSubmit={onSubmitForgot} className="space-y-3">
            <p className="text-sm text-muted">Enter your email and we&apos;ll send a reset code.</p>
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="inp" placeholder="you@example.com" />
            </Field>
            <button disabled={loading} className="w-full rounded-lg bg-primary py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
        ) : mode === "reset" ? (
          <form onSubmit={onSubmitReset} className="space-y-3">
            <Field label="6-digit code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="------"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-primary"
              />
            </Field>
            <Field label="New password">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="inp" placeholder="min 8 characters" />
            </Field>
            <button disabled={loading || code.length < 6 || password.length < 8} className="w-full rounded-lg bg-primary py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {loading ? "Resetting…" : "Reset password & log in"}
            </button>
            <button type="button" onClick={resend} disabled={loading} className="w-full text-sm text-primary hover:underline">
              Resend code
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitCredentials} className="space-y-3">
            {mode === "signup" && (
              <Field label="Name (optional)">
                <input value={name} onChange={(e) => setName(e.target.value)} className="inp" placeholder="Your name" />
              </Field>
            )}
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="inp" placeholder="you@example.com" />
            </Field>
            {mode === "signup" && (
              <Field label="Mobile (optional)">
                <input value={mobile} onChange={(e) => setMobile(e.target.value)} className="inp" placeholder="98XXXXXXXX" />
              </Field>
            )}
            <Field label="Password">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="inp" placeholder="min 8 characters" />
            </Field>
            <button disabled={loading} className="w-full rounded-lg bg-primary py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {loading ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}
            </button>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}
                className="w-full text-sm text-primary hover:underline"
              >
                Forgot password?
              </button>
            )}
          </form>
        )}

        {(mode === "login" || mode === "signup") && (
          <p className="mt-4 text-center text-sm text-muted">
            {mode === "signup" ? (
              <>Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Log in</Link></>
            ) : (
              <>New here? <Link href="/signup" className="font-semibold text-primary hover:underline">Create account</Link></>
            )}
          </p>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button
            type="button"
            onClick={() => { setMode("login"); setError(null); setInfo(null); }}
            className="mt-4 block w-full text-center text-sm text-muted hover:text-primary"
          >
            ← Back to login
          </button>
        )}
      </div>

      <style>{`.inp{width:100%;border-radius:.5rem;border:1px solid var(--border);background:var(--surface-2);padding:.5rem .75rem;font-size:.875rem;outline:none}.inp:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
