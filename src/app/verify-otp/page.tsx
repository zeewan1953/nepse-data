"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyOtpContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [timer, setTimer] = useState(300); // 5 min
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Masked email display
  const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "your email";

  // Countdown timer (5 min)
  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [timer]);

  // Resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const minutes = Math.floor(timer / 60);
  const seconds = timer % 60;
  const progressPercent = (timer / 300) * 100;

  async function post(url: string, payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Something went wrong");
        if (j.remaining !== undefined) setRemaining(j.remaining);
        if (j.locked) setTimer(900); // 15 min lockout
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length < 6) return;
    const j = await post("/api/auth/verify-otp", { email, code: fullCode });
    if (j?.ok) {
      router.push("/");
      router.refresh();
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    const j = await post("/api/auth/resend-otp", { email });
    if (j) {
      if (j.cooldown) {
        setCooldown(j.cooldown);
        setError(`Please wait ${j.cooldown}s`);
      } else {
        setInfo("New OTP sent to your email");
        setTimer(300);
        setRemaining(null);
        setCode(["", "", "", "", "", ""]);
        inputsRef.current[0]?.focus();
      }
    }
  }

  function handleChange(idx: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[idx] = value.slice(-1);
    setCode(newCode);
    if (value && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    const nextIdx = Math.min(pasted.length, 5);
    inputsRef.current[nextIdx]?.focus();
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
          {/* Envelope icon */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F5E9]">
              <svg className="w-8 h-8 text-[#1B5E20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-black text-[#1A1A1A] mb-2 text-center">Enter Verification Code</h1>
          <p className="text-gray-600 text-center mb-6">
            We sent a 6-digit code to <span className="font-semibold text-[#1B5E20]">{maskedEmail}</span>
          </p>

          {/* Timer with progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">Code expires in</span>
              <span className={`text-lg font-black tabular-nums ${
                timer > 60 ? "text-[#1B5E20]" : "text-red-500 animate-pulse"
              }`}>
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  timer > 120 ? "bg-[#1B5E20]" : timer > 60 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
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
              {remaining !== null && remaining > 0 && (
                <p className="mt-2 text-xs text-red-600 font-medium">Attempts remaining: {remaining}</p>
              )}
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

          <form onSubmit={onSubmit}>
            {/* 6-digit OTP boxes */}
            <div className="mb-8 flex justify-center gap-3" onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputsRef.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoFocus={idx === 0}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className={`w-[52px] h-[56px] rounded-xl border-2 text-center text-2xl font-black outline-none transition-all duration-200 animate-[bounceIn_0.3s_ease-out] ${
                    digit
                      ? "border-[#1B5E20] bg-[#E8F5E9] text-[#1B5E20]"
                      : "border-gray-300 bg-white text-[#1A1A1A] focus:border-[#1B5E20] focus:ring-2 focus:ring-[#1B5E20]/20"
                  }`}
                />
              ))}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || code.some((d) => !d)}
              className="w-full h-12 rounded-xl bg-[#1B5E20] text-white font-bold text-base transition-all duration-200 hover:bg-[#145214] hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-[#1B5E20]/25 mb-4"
            >
              {loading ? (
                <span className="inline-flex items-center gap-3">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Verifying…
                </span>
              ) : (
                "Verify & Continue"
              )}
            </button>

            {/* Resend & Back */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Login
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={loading || cooldown > 0}
                className={`text-sm font-semibold transition-colors ${
                  cooldown > 0
                    ? "text-gray-400 cursor-not-allowed"
                    : "text-[#1B5E20] hover:text-[#145214]"
                }`}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
              </button>
            </div>
          </form>
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
        @keyframes bounceIn {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#1B5E20] border-t-transparent" />
          <span className="text-gray-600 font-medium">Loading…</span>
        </div>
      </div>
    }>
      <VerifyOtpContent />
    </Suspense>
  );
}
