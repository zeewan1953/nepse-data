import "server-only";
import { Resend } from "resend";

// Resend.com — free tier allows sending from onboarding@resend.dev
// No sender verification needed. Works instantly for any recipient email.
const FROM_EMAIL = process.env.EMAIL_FROM || "DARI SIR <onboarding@resend.dev>";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendOtpEmail(
  to: string,
  code: string,
): Promise<{ sent: boolean; devCode?: string }> {
  const resend = getResend();

  if (!resend) {
    console.log(`\n[DARI SIR OTP] ${to} -> ${code} (set RESEND_API_KEY env var to email it)\n`);
    return { sent: false, devCode: code };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `DARI SIR — Your Login Code: ${code}`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
        <div style="text-align:center;margin-bottom:32px">
          <span style="display:inline-block;background:#1B5E20;color:#fff;padding:8px 24px;border-radius:8px;font-weight:900;font-size:20px">DARI SIR</span>
        </div>
        <h1 style="color:#1B5E20;text-align:center;margin:0 0 24px">Login Verification</h1>
        <p style="color:#555;text-align:center;font-size:16px;margin:0 0 32px">Use this code to log in to your DARI SIR account:</p>
        <div style="background:#f0f7f0;border:2px solid #1B5E20;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:48px;font-weight:900;letter-spacing:8px;color:#1B5E20">${code}</span>
        </div>
        <p style="color:#888;text-align:center;font-size:14px;margin:0 0 8px">&#9200; Valid for <b>5 minutes</b></p>
        <p style="color:#d32f2f;text-align:center;font-size:13px;margin:0">&#9888; Do not share this code with anyone</p>
      </div>`,
    });

    if (error) {
      console.error("Resend sendOtp error:", error.message);
      // Fallback: return code in response for dev/testing
      return { sent: false, devCode: code };
    }

    return { sent: true };
  } catch (e) {
    console.error("Resend sendOtp exception:", (e as Error).message);
    return { sent: false, devCode: code };
  }
}

export async function sendPasswordChangedEmail(
  to: string,
): Promise<{ sent: boolean }> {
  const resend = getResend();

  if (!resend) {
    console.log(`\n[DARI SIR Password Changed] ${to} (set RESEND_API_KEY env var to email it)\n`);
    return { sent: false };
  }

  const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "DARI SIR — Password Changed Successfully",
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
        <div style="text-align:center;margin-bottom:32px">
          <span style="display:inline-block;background:#1B5E20;color:#fff;padding:8px 24px;border-radius:8px;font-weight:900;font-size:20px">DARI SIR</span>
        </div>
        <h1 style="color:#1B5E20;text-align:center;margin:0 0 24px">&#9989; Password Changed</h1>
        <p style="color:#555;text-align:center;font-size:16px;margin:0 0 16px">Your DARI SIR account password was successfully changed.</p>
        <p style="color:#555;text-align:center;font-size:16px;margin:0 0 32px"><b>${now}</b> (Nepal Time)</p>
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px">
          <p style="color:#856404;font-size:14px;margin:0">&#9888; If you did not make this change, <b>contact support immediately</b></p>
        </div>
        <p style="color:#888;text-align:center;font-size:13px;margin:0">For security, your previous sessions have been invalidated.</p>
      </div>`,
    });

    if (error) {
      console.error("Resend passwordChanged error:", error.message);
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    console.error("Resend passwordChanged exception:", (e as Error).message);
    return { sent: false };
  }
}
