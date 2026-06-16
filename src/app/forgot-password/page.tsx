"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Something went wrong");
        return;
      }
      setSent(true);
      setInfo(j.devCode ? `Dev code: ${j.devCode}` : `Reset code sent to ${email}. Check your inbox.`);
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
          <h1 className="mb-1 text-xl font-bold text-center">Forgot Password</h1>
          <p className="mb-4 text-center text-sm text-muted">Enter your email to receive a reset code</p>

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
