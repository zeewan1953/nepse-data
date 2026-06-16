"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const [mode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Load Google Identity Services
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // @ts-ignore
      const google = window.google;
      if (!google?.accounts?.id) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
      });
      if (googleBtnRef.current) {
        google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: 340,
          text: mode === "signup" ? "signup_with" : "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
      }
    };
    document.head.appendChild(script);
  }, []);

  async function handleGoogleCredential(response: any) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Google login failed");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function post(url: string, payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const j = await post(url, { email, password, mobile, name });
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
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>

        {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-sm text-down">{error}</div>}

        {/* Google Sign-In */}
        <div className="mb-4 flex justify-center" ref={googleBtnRef} />
        {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <button type="button" disabled className="mb-4 w-full rounded-lg border border-border py-2 text-sm text-muted flex items-center justify-center gap-2 cursor-not-allowed">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google (not configured)
          </button>
        )}

        {/* Divider */}
        <div className="relative flex items-center gap-3 py-2 mb-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted font-medium">OR</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <Field label="Name (optional)">
              <input value={name} onChange={(e) => setName(e.target.value)} className="inp" placeholder="Your name" />
            </Field>
          )}
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="inp" placeholder="you@example.com" required />
          </Field>
          {mode === "signup" && (
            <Field label="Mobile (optional)">
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className="inp" placeholder="98XXXXXXXX" />
            </Field>
          )}
          <Field label="Password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="inp" placeholder="min 8 characters" required />
          </Field>
          <button disabled={loading} className="w-full rounded-lg bg-primary py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {loading ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {mode === "signup" ? (
            <>Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Log in</Link></>
          ) : (
            <>New here? <Link href="/signup" className="font-semibold text-primary hover:underline">Create account</Link></>
          )}
        </p>
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
