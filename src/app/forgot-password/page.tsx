"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();

      if (!r.ok) {
        setError(j.error ?? "Something went wrong");
        return;
      }

      if (j.devCode) {
        setDevCode(j.devCode);
      }

      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
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

        {/* Card */}
        <div className="rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-gray-200 p-10 animate-[fadeIn_0.3s_ease-out]">
          {!success ? (
            <>
              {/* Back button */}
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors mb-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Login
              </Link>

              {/* Lock icon */}
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>

              <h1 className="text-3xl font-black text-[#1A1A1A] mb-2 text-center">Forgot Password?</h1>
              <p className="text-gray-600 text-center mb-8">
                Enter your email and we&apos;ll send a reset code
              </p>

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

              {devCode && (
                <div className="mb-6 p-4 rounded-xl border-2 border-dashed border-[#1B5E20] bg-[#E8F5E9]">
                  <p className="text-xs text-gray-600 mb-1 text-center">Development — use this code:</p>
                  <p className="text-3xl font-black tracking-[0.3em] text-[#1B5E20] text-center">{devCode}</p>
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-5">
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
            </>
          ) : (
            /* Success State */
            <div className="text-center animate-[fadeIn_0.5s_ease-out]">
              {/* Success checkmark animation */}
              <div className="mb-6 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 animate-[scaleIn_0.5s_ease-out]">
                  <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <h2 className="text-2xl font-black text-[#1A1A1A] mb-2">Reset Code Sent!</h2>
              <p className="text-gray-600 mb-2">Check your inbox for the reset code.</p>
              <p className="text-sm text-gray-500 mb-8">
                Code expires in <span className="font-semibold text-[#1B5E20]">15 minutes</span>
              </p>

              <button
                onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}${devCode ? `&devCode=${devCode}` : ""}`)}
                className="w-full h-12 rounded-xl bg-[#1B5E20] text-white font-bold text-base transition-all duration-200 hover:bg-[#145214] hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-[#1B5E20]/25 mb-4"
              >
                Enter Reset Code
              </button>

              <button
                onClick={() => { setSuccess(false); setEmail(""); }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Didn&apos;t receive it? Try again
              </button>
            </div>
          )}
        </div>

        {/* Support link */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Having trouble?{" "}
          <button className="text-[#1B5E20] hover:underline font-medium">
            Contact Support
          </button>
        </p>
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
        @keyframes scaleIn {
          0% { transform: scale(0); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
