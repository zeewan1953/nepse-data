"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Load Google Identity Services
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    // Load script
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

  // Mock NEPSE ticker data
  const nepseIndex = 2728.03;
  const nepseChange = -7.91;
  const nepsePercent = -0.29;

  async function onSubmitLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Something went wrong");
        return;
      }
      router.push(from);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* LEFT PANEL - Branding (40%) */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-between bg-gradient-to-br from-[#0D2818] via-[#1B5E20] to-[#0D2818] p-12 text-white relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10">
          {/* Logo */}
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

          {/* Tagline */}
          <h1 className="text-4xl font-black leading-tight mb-4">
            Nepal ko Sabai Bhanda<br />
            <span className="text-[#FFD700]">Trusted</span> NEPSE Platform
          </h1>
          <p className="text-lg text-white/80 mb-12">
            Real-time market data, AI analysis, aur portfolio tracking — sabai ekai thau ma.
          </p>

          {/* NEPSE Index Ticker */}
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-6 mb-12">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white/70">NEPSE INDEX</span>
              <span className="text-xs px-3 py-1 rounded-full bg-white/10 border border-white/20">LIVE</span>
            </div>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-black">{nepseIndex.toLocaleString()}</span>
              <div className={`flex items-center gap-2 text-xl font-bold ${nepseChange < 0 ? 'text-red-400' : 'text-green-400'}`}>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <span>{nepseChange} ({nepsePercent}%)</span>
              </div>
            </div>
          </div>

          {/* Features */}
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

        {/* Bottom badge */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="px-4 py-2 rounded-full bg-[#FFD700]/20 border border-[#FFD700]/40">
            <span className="text-sm font-bold text-[#FFD700]">NEPSE Pro</span>
          </div>
          <p className="text-xs text-white/50">© 2026 DARI SIR. All rights reserved.</p>
        </div>
      </div>

      {/* RIGHT PANEL - Login Form (60%) */}
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
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 animate-[shake_0.5s_ease-in-out]">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* LOGIN FORM */}
          <div className="animate-[fadeIn_0.3s_ease-out]">
            <div className="mb-8">
              <h2 className="text-3xl font-black text-[#1A1A1A] mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in to your DARI SIR account</p>
            </div>

            {/* Google Sign-In Button */}
            <div className="mb-5">
              <div ref={googleBtnRef} className="flex justify-center" />
              {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                <button
                  type="button"
                  disabled
                  className="w-full h-12 rounded-xl border-2 border-gray-200 bg-white text-gray-400 font-semibold text-sm flex items-center justify-center gap-3 cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google (not configured)
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="relative flex items-center gap-4 py-2 mb-5">
              <div className="flex-1 h-px bg-gray-300" />
              <span className="text-sm text-gray-500 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-300" />
            </div>

            <form onSubmit={onSubmitLogin} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full h-12 pl-12 pr-4 rounded-xl border border-gray-300 bg-white text-sm outline-none transition-all duration-200 focus:border-[#1B5E20] focus:ring-2 focus:ring-[#1B5E20]/20 hover:border-gray-400"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full h-12 pl-12 pr-12 rounded-xl border border-gray-300 bg-white text-sm outline-none transition-all duration-200 focus:border-[#1B5E20] focus:ring-2 focus:ring-[#1B5E20]/20 hover:border-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#1B5E20] focus:ring-[#1B5E20]/20 cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">Remember me</span>
                </label>
              </div>

              {/* Login button */}
              <button
                disabled={loading || !email || !password}
                className="w-full h-12 rounded-xl bg-[#1B5E20] text-white font-bold text-base transition-all duration-200 hover:bg-[#145214] hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-[#1B5E20]/25"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-3">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Signing in…
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            {/* Sign up link */}
            <p className="mt-8 text-center text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-bold text-[#1B5E20] hover:text-[#145214] transition-colors">
                Create Account
              </Link>
            </p>

            {/* Support link */}
            <p className="mt-4 text-center text-xs text-gray-500">
              Having trouble?{" "}
              <button className="text-[#1B5E20] hover:underline font-medium">
                Contact Support
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
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
