"use client";
import { useState } from "react";
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
