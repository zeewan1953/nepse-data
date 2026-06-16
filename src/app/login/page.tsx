"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const [step, setStep] = useState<"email" | "otp" | "forgot">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mock NEPSE ticker data
  const nepseIndex = 2728.03;
  const nepseChange = -7.91;
  const nepsePercent = -0.29;

  async function post(url: string, payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setInfo(null);
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

  async function onSubmitLogin(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/login", { email, password, rememberMe });
    if (!j) return;
    if (j.needOtp) {
      setStep("otp");
      if (j.devCode) setDevCode(j.devCode);
      setInfo(j.devCode ? "Email not configured — use code below" : `OTP sent to ${email}`);
    } else if (j.ok) {
      router.push(from);
      router.refresh();
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/verify-otp", { email, code: (e.target as any).code?.value });
    if (j?.ok) {
      router.push(from);
      router.refresh();
    }
  }

  async function resendOtp() {
    const j = await post("/api/auth/resend-otp", { email });
    if (j) {
      if (j.devCode) setDevCode(j.devCode);
      if (j.cooldown) {
        setError(`Please wait ${j.cooldown}s before requesting again`);
      } else {
        setInfo("New OTP sent to your email");
      }
    }
  }

  async function onSubmitForgot(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/api/auth/forgot-password", { email });
    if (j) {
      if (j.devCode) {
        setDevCode(j.devCode);
        setInfo("Email not configured — use code below");
      } else {
        setInfo(`Reset code sent to ${email}`);
      }
      router.push(`/forgot-password?email=${encodeURIComponent(email)}`);
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

          {/* Error/Info messages */}
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

          {info && (
            <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-green-700 font-medium">{info}</p>
              </div>
            </div>
          )}

          {devCode && step === "otp" && (
            <button
              type="button"
              onClick={() => {
                const input = document.querySelector('input[name="otp"]') as HTMLInputElement;
                if (input) input.value = devCode;
              }}
              className="mb-6 w-full p-4 rounded-xl border-2 border-dashed border-[#1B5E20] bg-white hover:bg-[#E8F5E9] transition-all duration-200 cursor-pointer"
            >
              <p className="text-xs text-gray-500 mb-1">Development — tap to fill:</p>
              <p className="text-3xl font-black tracking-[0.3em] text-[#1B5E20]">{devCode}</p>
            </button>
          )}

          {/* EMAIL + PASSWORD STEP */}
          {step === "email" && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <div className="mb-8">
                <h2 className="text-3xl font-black text-[#1A1A1A] mb-2">Welcome Back</h2>
                <p className="text-gray-600">Sign in to your DARI SIR account</p>
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

                {/* Remember me & Forgot */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-[#1B5E20] focus:ring-[#1B5E20]/20 cursor-pointer"
                    />
                    <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => { setStep("forgot"); setError(null); setInfo(null); }}
                    className="text-sm font-semibold text-[#1B5E20] hover:text-[#145214] transition-colors"
                  >
                    Forgot Password?
                  </button>
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

                {/* Divider */}
                <div className="relative flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-gray-300" />
                  <span className="text-sm text-gray-500 font-medium">OR</span>
                  <div className="flex-1 h-px bg-gray-300" />
                </div>

                {/* Login with OTP */}
                <button
                  type="button"
                  onClick={() => { setStep("otp"); setError(null); setInfo(null); }}
                  className="w-full h-12 rounded-xl border-2 border-[#1B5E20] text-[#1B5E20] font-bold text-base bg-transparent transition-all duration-200 hover:bg-[#E8F5E9] hover:scale-[1.01] active:scale-[0.98]"
                >
                  Login with OTP
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
          )}

          {/* OTP STEP */}
          {step === "otp" && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F5E9]">
                  <svg className="w-8 h-8 text-[#1B5E20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-black text-[#1A1A1A] mb-2">Check Your Email</h2>
                <p className="text-gray-600">
                  We sent a 6-digit code to <span className="font-semibold text-[#1B5E20]">{email}</span>
                </p>
              </div>

              <form onSubmit={onSubmitOtp} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-3 text-center">Verification Code</label>
                  <input
                    type="text"
                    name="otp"
                    placeholder="••••••"
                    className="w-full h-14 rounded-xl border border-gray-300 bg-white text-center text-2xl font-black tracking-[0.4em] outline-none transition-all duration-200 focus:border-[#1B5E20] focus:ring-2 focus:ring-[#1B5E20]/20"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-[#1B5E20] text-white font-bold text-base transition-all duration-200 hover:bg-[#145214] hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-[#1B5E20]/25"
                >
                  Verify & Continue
                </button>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setError(null); setInfo(null); }}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    ← Back to Login
                  </button>
                  <button
                    type="button"
                    onClick={resendOtp}
                    className="text-sm font-semibold text-[#1B5E20] hover:text-[#145214] transition-colors"
                  >
                    Resend Code
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD STEP */}
          {step === "forgot" && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <div className="mb-8">
                <button
                  onClick={() => { setStep("email"); setError(null); setInfo(null); }}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors mb-6"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Login
                </button>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-black text-[#1A1A1A] mb-2">Forgot Password?</h2>
                <p className="text-gray-600">Enter your email and we&apos;ll send a reset code</p>
              </div>

              <form onSubmit={onSubmitForgot} className="space-y-5">
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

                <button
                  disabled={loading || !email}
                  className="w-full h-12 rounded-xl bg-[#1B5E20] text-white font-bold text-base transition-all duration-200 hover:bg-[#145214] hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#1B5E20]/25"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-3">
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Sending…
                    </span>
                  ) : (
                    "Send Reset Code"
                  )}
                </button>
              </form>
            </div>
          )}
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
