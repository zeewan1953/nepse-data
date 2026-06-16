"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Load Google Identity Services
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || clientId.includes("PASTE")) return;

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
          text: initialMode === "signup" ? "signup_with" : "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
      }
      setGoogleReady(true);
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

  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-white">D</span>
          <span className="text-xl font-extrabold">DARI SIR</span>
        </div>
        <h1 className="mb-2 text-lg font-bold">
          {initialMode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-6 text-sm text-muted">
          Sign in with your Google account to continue
        </p>

        {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-sm text-down">{error}</div>}

        {/* Google Sign-In Button */}
        <div className="mb-4 flex justify-center" ref={googleBtnRef} />

        {loading && (
          <div className="flex items-center justify-center gap-3 py-4">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#1B5E20] border-t-transparent" />
            <span className="text-sm text-muted">Signing you in...</span>
          </div>
        )}

        {!googleReady && !loading && (
          <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
            <p className="text-sm text-yellow-800 font-medium mb-1">Google Sign-In not configured</p>
            <p className="text-xs text-yellow-700">Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable login.</p>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          {initialMode === "signup" ? (
            <>Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></>
          ) : (
            <>New here? <Link href="/signup" className="font-semibold text-primary hover:underline">Create account</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
