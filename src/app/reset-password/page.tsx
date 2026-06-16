"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";
  const devCodeParam = params.get("devCode") || "";

  const [code, setCode] = useState(devCodeParam || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // Password strength calculation
  const strength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;
    return Math.min(score, 5);
  })();

  const strengthLabel = strength <= 1 ? "Weak" : strength <= 2 ? "Fair" : strength <= 3 ? "Good" : strength <= 4 ? "Strong" : "Very Strong";
  const strengthColor = strength <= 1 ? "bg-red-500" : strength <= 2 ? "bg-yellow-500" : strength <= 3 ? "bg-blue-500" : "bg-green-500";

  // Password requirements
  const requirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
    { label: "One special character", met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) },
  ];

  // Redirect countdown on success
  useEffect(() => {
    if (!success) return;
    if (redirectCountdown <= 0) {
      router.push("/login");
      return;
    }
    const timer = setTimeout(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [success, redirectCountdown, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (code.length !== 6) {
      setError("Please enter a 6-digit reset code");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const j = await r.json();

      if (!r.ok) {
        setError(j.error ?? "Something went wrong");
        return;
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
              <h1 className="text-3xl font-black text-[#1A1A1A] mb-2 text-center">Create New Password</h1>
              <p className="text-gray-600 text-center mb-8">
                Enter the reset code and your new password
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

              <form onSubmit={onSubmit} className="space-y-5">
                {/* Reset Code */}
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Reset Code</label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="••••••"
                    className="w-full h-12 rounded-xl border border-gray-300 bg-white text-center text-2xl font-black tracking-[0.4em] outline-none transition-all duration-200 focus:border-[#1B5E20] focus:ring-2 focus:ring-[#1B5E20]/20 hover:border-gray-400"
                  />
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">New Password</label>
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

                  {/* Password Strength Meter */}
                  {password && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-600">Password Strength</span>
                        <span className={`text-xs font-bold ${strength <= 2 ? 'text-red-500' : strength <= 3 ? 'text-blue-500' : 'text-green-500'}`}>
                          {strengthLabel}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${strengthColor} transition-all duration-300`}
                          style={{ width: `${(strength / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Requirements Checklist */}
                  {password && (
                    <div className="mt-4 space-y-2">
                      {requirements.map((req, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`flex items-center justify-center w-5 h-5 rounded-full transition-all duration-200 ${
                            req.met ? 'bg-green-500' : 'bg-gray-200'
                          }`}>
                            {req.met ? (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            )}
                          </div>
                          <span className={`text-xs transition-colors duration-200 ${
                            req.met ? 'text-green-600 font-medium' : 'text-gray-500'
                          }`}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Confirm Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <input
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      type={showConfirm ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      className={`w-full h-12 pl-12 pr-12 rounded-xl border bg-white text-sm outline-none transition-all duration-200 hover:border-gray-400 ${
                        confirmPassword && confirmPassword !== password
                          ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                          : confirmPassword && confirmPassword === password
                          ? 'border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-200'
                          : 'border-gray-300 focus:border-[#1B5E20] focus:ring-2 focus:ring-[#1B5E20]/20'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showConfirm ? (
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
                  {confirmPassword && confirmPassword !== password && (
                    <p className="mt-2 text-xs text-red-600 font-medium">Passwords do not match</p>
                  )}
                  {confirmPassword && confirmPassword === password && (
                    <p className="mt-2 text-xs text-green-600 font-medium">✓ Passwords match</p>
                  )}
                </div>

                {/* Submit button */}
                <button
                  disabled={loading || !code || !password || !confirmPassword}
                  className="w-full h-12 rounded-xl bg-[#1B5E20] text-white font-bold text-base transition-all duration-200 hover:bg-[#145214] hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#1B5E20]/25"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-3">
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Resetting…
                    </span>
                  ) : (
                    "Reset Password"
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

              <h2 className="text-2xl font-black text-[#1A1A1A] mb-2">Password Changed!</h2>
              <p className="text-gray-600 mb-8">
                Your password has been successfully reset.
              </p>

              <div className="p-4 rounded-xl bg-green-50 border border-green-200 mb-6">
                <p className="text-sm text-green-700 font-medium">
                  Redirecting to login in <span className="font-black text-lg">{redirectCountdown}s</span>...
                </p>
              </div>

              <button
                onClick={() => router.push("/login")}
                className="w-full h-12 rounded-xl bg-[#1B5E20] text-white font-bold text-base transition-all duration-200 hover:bg-[#145214] hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-[#1B5E20]/25"
              >
                Go to Login Now
              </button>
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
        @keyframes scaleIn {
          0% { transform: scale(0); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#1B5E20] border-t-transparent" />
          <span className="text-gray-600 font-medium">Loading…</span>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
