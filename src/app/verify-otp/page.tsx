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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-surface to-surface-2 px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 shadow-lg shadow-primary/20">
            <span className="text-xl font-black text-white">D</span>
            <span className="text-lg font-bold text-white">DARI SIR</span>
          </div>
          <p className="text-sm text-muted">NEPSE Live Market</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-lg">
          <h1 className="mb-1 text-xl font-bold text-center">Verify Email</h1>
          <p className="mb-4 text-center text-sm text-muted">Enter the 6-digit code sent to <b className="text-foreground">{email}</b></p>

          {/* Timer */}
          <div className="mb-4 flex justify-center">
            <span className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
              timer > 60 ? "bg-up-bg text-up" : timer > 0 ? "bg-down-bg text-down animate-pulse" : ""
            }`}>
              ⏱️ {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-down/20 bg-down-bg px-3 py-2 text-sm text-down">
              ⚠️ {error}
              {remaining !== null && remaining > 0 && <span className="block mt-1">Attempts remaining: {remaining}</span>}
            </div>
          )}
          {info && (
            <div className="mb-4 rounded-lg border border-up/20 bg-up-bg px-3 py-2 text-sm text-up">
              ✅ {info}
            </div>
          )}

          <form onSubmit={onSubmit}>
            {/* 6-digit boxes */}
            <div className="mb-4 flex justify-center gap-2" onPaste={handlePaste}>
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
                  className="w-12 h-14 rounded-xl border-2 border-border bg-surface-2 text-center text-2xl font-black outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || code.some((d) => !d)}
              className="w-full rounded-xl bg-primary py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Verifying…
                </span>
              ) : (
                "Verify & Continue"
              )}
            </button>

            <button
              type="button"
              onClick={resend}
              disabled={loading || cooldown > 0}
              className="mt-3 w-full text-center text-sm font-medium text-primary transition hover:underline disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-2 w-full text-center text-sm text-muted transition hover:text-foreground"
            >
              ← Back to login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><span className="text-muted">Loading…</span></div>}>
      <VerifyOtpContent />
    </Suspense>
  );
}
