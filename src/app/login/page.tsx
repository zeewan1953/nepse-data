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

  // Load Google Identity Services script
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || clientId.includes("PASTE")) return;

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      initGoogle();
      return;
    }

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
        if (!j.ok && j.error) {
          setError(j.error);
          return;
        }
        if (!j.ok) {
          setError("Google login failed");
          return;
        }
        router.push(from);
        router.refresh();
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
    // This triggers the Google account picker popup
    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: try OAuth redirect flow
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        const redirectUri = window.location.origin + "/api/auth/google/callback";
        const scope = "openid email profile";
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=${encodeURIComponent(scope)}&nonce=${Date.now()}`;
        window.location.href = url;
      }
    });
  }

  return (
    <div className="flex min-h-screen">
      {/* LEFT PANEL - Branding */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-between bg-gradient-to-br from-[#0D2818] via-[#1B5E20] to-[#0D2818] p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10">
          <div className="mb-8">
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-6 py-4 backdrop-blur-sm border border-white/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FFA000] shadow-lg">
                <span className="text-2xl font-black text-[#0D2818]">D</span>
              </div>
              <div>
                <span className="text-2xl font-black tracking-wide">DARI SIR</span>
                <p className="text-xs text-white/70">NEPSE Live Market</p>
              </div>
            </div>
          </div>

          <h1 className="text-4xl font-black leading-tight mb-4">
            Nepal ko Sabai Bhanda<br />
            <span className="text-[#FFD700]">Trusted</span> NEPSE Platform
          </h1>
          <p className="text-lg text-white/80 mb-12">
            Real-time market data, AI analysis, aur portfolio tracking — sabai ekai thau ma.
          </p>

          <div className="space-y-6">
            {[
              { icon: "📊", title: "Real-time Market Data", desc: "Live NEPSE updates every 3 seconds" },
              { icon: "💼", title: "Portfolio Tracking", desc: "Track your investments in real-time" },
              { icon: "🤖", title: "AI Market Analysis", desc: "Smart signals powered by Groq AI" }
            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                <div className="text-3xl">{feature.icon}</div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{feature.title}</h3>
                  <p className="text-sm text-white/70">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <div className="px-4 py-2 rounded-full bg-[#FFD700]/20 border border-[#FFD700]/40">
            <span className="text-sm font-bold text-[#FFD700]">NEPSE Pro</span>
          </div>
          <p className="text-xs text-white/50">&copy; 2026 DARI SIR. All rights reserved.</p>
        </div>
      </div>

      {/* RIGHT PANEL - Google Login Only */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center gap-3 rounded-2xl bg-[#1B5E20] px-6 py-4 shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FFA000]">
                <span className="text-2xl font-black text-[#0D2818]">D</span>
              </div>
              <div>
                <span className="text-2xl font-black text-white tracking-wide">DARI SIR</span>
                <p className="text-xs text-white/70">NEPSE Live Market</p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Google Sign-In Only */}
          <div className="animate-[fadeIn_0.3s_ease-out] text-center">
            <div className="mb-8">
              <h2 className="text-3xl font-black text-[#1A1A1A] mb-2">Welcome to DARI SIR</h2>
              <p className="text-gray-600">Sign in with your Google account to continue</p>
            </div>

            {/* Custom Google Sign-In Button */}
            <button
              onClick={onGoogleClick}
              disabled={loading}
              className="w-full max-w-sm mx-auto h-14 rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all duration-200 flex items-center justify-center gap-3 px-6 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              <span className="text-base font-semibold text-gray-700">
                {loading ? "Signing in..." : "Continue with Google"}
              </span>
            </button>

            {/* Support link */}
            <p className="mt-8 text-center text-xs text-gray-500">
              Having trouble?{" "}
              <button className="text-[#1B5E20] hover:underline font-medium">
                Contact Support
              </button>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
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
