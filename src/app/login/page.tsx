"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

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

  function showToast(msg: string, type: string = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function handleGoogleCredential(response: any) {
    setLoading(true);
    setError(null);
    showToast("Signing in...", "success");
    fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          showToast("Welcome back! 🎉", "success");
          setTimeout(() => { router.push(from); router.refresh(); }, 600);
        } else {
          setError(j.error ?? "Google login failed");
          showToast(j.error ?? "Google login failed", "error");
        }
      })
      .catch((e) => {
        setError((e as Error).message);
        showToast((e as Error).message, "error");
      })
      .finally(() => setLoading(false));
  }

  function onGoogleClick() {
    setError(null);
    // @ts-ignore
    const google = window.google;
    if (!google?.accounts?.id) {
      // Check if script is even loaded
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId || clientId.includes("PASTE")) {
        showToast("Google Sign-In not configured yet.", "error");
        setError("Google Client ID is not set. Please contact support.");
      } else {
        showToast("Google Sign-In loading, please wait...", "info");
        // Try loading script manually
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => {
          initGoogle();
          setTimeout(() => {
            // @ts-ignore
            const g = window.google;
            if (g?.accounts?.id) {
              g.accounts.id.prompt();
            } else {
              showToast("Please refresh the page and try again.", "error");
            }
          }, 500);
        };
        document.head.appendChild(script);
      }
      return;
    }

    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: OAuth redirect
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        const redirectUri = window.location.origin + "/api/auth/google/callback";
        const scope = "openid email profile";
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=${encodeURIComponent(scope)}&nonce=${Date.now()}`;
        window.location.href = url;
      }
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9] p-4">
      {/* Login Card */}
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-10 md:p-12 text-center shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        {/* Logo */}
        <div className="mb-1 text-3xl font-bold text-[#111827]">
          <span className="text-[#1B5E20] mr-2">📊</span>
          DARI SIR
        </div>
        <p className="text-sm text-[#6b7280] mb-8">Sign in to your account</p>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-left">
            {error}
          </div>
        )}

        {/* Google Sign-In Button */}
        <button
          onClick={onGoogleClick}
          disabled={loading}
          className="w-full rounded-lg border border-[#d1d5db] bg-white py-3 px-4 text-base font-medium text-[#374151] flex items-center justify-center gap-3 transition-all duration-200 hover:bg-[#f9fafb] hover:border-[#9ca3af] disabled:opacity-50 disabled:cursor-not-allowed"
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
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>

        {/* WhatsApp Support */}
        <div className="mt-6 border-t border-[#e5e7eb] pt-5">
          <a
            href="https://wa.me/9779705100088"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-lg bg-[#25D366] px-6 py-2.5 text-[15px] font-medium text-white transition-all duration-200 hover:bg-[#1da851] hover:scale-[1.02] no-underline"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Contact Support
          </a>
          <p className="text-[13px] text-[#6b7280] mt-3">
            <span className="mr-1">🕐</span> Available 24/7 on WhatsApp
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 rounded-xl px-7 py-3.5 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] z-[999] max-w-[90%] text-center animate-[fadeUp_0.3s_ease] ${
          toast.type === "success" ? "bg-[#22c55e]" : toast.type === "error" ? "bg-[#ef4444]" : "bg-[#1f2937]"
        }`}>
          {toast.msg}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9]">
        <div className="flex items-center gap-3">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#1B5E20] border-t-transparent" />
          <span className="text-gray-600 font-medium">Loading...</span>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
