"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load Google Identity Services
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
    if (!google?.accounts?.id) {
      setError("Google Sign-In not ready. Please wait or refresh the page.");
      return;
    }
    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        const redirectUri = window.location.origin + "/api/auth/google/callback";
        const scope = "openid email profile";
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=${encodeURIComponent(scope)}&nonce=${Date.now()}`;
        window.location.href = url;
      }
    });
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

        {/* Custom Google Sign-In Button */}
        <button
          onClick={onGoogleClick}
          disabled={loading}
          className="w-full max-w-sm mx-auto h-12 rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all duration-200 flex items-center justify-center gap-3 px-6 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span className="text-sm font-semibold text-gray-700">
            {loading ? "Signing in..." : initialMode === "signup" ? "Sign up with Google" : "Continue with Google"}
          </span>
        </button>

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
