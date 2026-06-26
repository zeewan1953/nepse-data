"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || clientId.includes("PASTE")) return;

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) { initGoogle(); return; }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => initGoogle();
    document.head.appendChild(script);
  }, []);

  function initGoogle() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    // @ts-ignore
    const google = window.google;
    if (!google?.accounts?.id) return;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false,
    });
    if (googleBtnRef.current) {
      googleBtnRef.current.innerHTML = "";
      google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        width: 300,
        text: initialMode === "signup" ? "signup_with" : "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
      });
    }
    setGoogleReady(true);
  }

  function handleGoogleCredential(response: any) {
    setLoading(true);
    setError(null);
    fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) { router.push("/"); router.refresh(); }
        else setError(j.error ?? "Google login failed");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }

  function onGoogleClick() {
    setError(null);
    // @ts-ignore
    const google = window.google;
    if (!google?.accounts?.id) { setError("Google Sign-In not ready. Please refresh."); return; }
    google.accounts.id.prompt();
  }

  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Logo size={40} />
        </div>
        <h1 className="mb-2 text-lg font-bold">
          {initialMode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-6 text-sm text-muted">Sign in with your Google account</p>

        {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-sm text-down">{error}</div>}

        <div className="mb-4 flex justify-center" ref={googleBtnRef} />

        {!googleReady && (
          <button onClick={onGoogleClick} className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-50">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        )}

        {loading && <div className="py-3 text-sm text-muted">Signing in...</div>}

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
