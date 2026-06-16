"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
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
          width: 400,
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
      }
      setGoogleReady(true);
    };
    document.head.appendChild(script);
  }, []);

  async function handleGoogleCredential(response: any) {
    setGoogleLoading(true);
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
      router.push(from);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGoogleLoading(false);
    }
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
          <p className="text-xs text-white/50">© 2026 DARI SIR. All rights reserved.</p>
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

            {/* Google Sign-In Button */}
            <div className="flex justify-center mb-6" ref={googleBtnRef} />

            {googleLoading && (
              <div className="flex items-center justify-center gap-3 py-4">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#1B5E20] border-t-transparent" />
                <span className="text-gray-600 font-medium">Signing you in...</span>
              </div>
            )}

            {!googleReady && !googleLoading && (
              <div className="p-6 rounded-xl bg-yellow-50 border border-yellow-200">
                <p className="text-sm text-yellow-800 font-medium mb-2">Google Sign-In not configured</p>
                <p className="text-xs text-yellow-700">Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in environment variables to enable login.</p>
              </div>
            )}

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
          <span className="text-gray-600 font-medium">Loading…</span>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
