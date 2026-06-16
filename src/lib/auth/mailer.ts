import "server-only";

// Resend REST API — https://resend.com/docs/send-with-nodejs
// Free tier: 100 emails/day, 3000/month

const RESEND_API_URL = "https://api.resend.com/emails";

const SENDER_EMAIL = "onboarding@resend.dev";
const SENDER_NAME = "DARI SIR";

// ─── Shared Resend send helper ───────────────────────────────────────────────
async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[DARI SIR] RESEND_API_KEY not set — email to ${to} not sent`);
    return { sent: false };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Resend API ${res.status}:`, err);
      return { sent: false };
    }

    const data = await res.json();
    console.log(`[DARI SIR] Email sent to ${to} — id: ${data.id}`);
    return { sent: true };
  } catch (e) {
    console.error("sendViaResend error:", (e as Error).message);
    return { sent: false };
  }
}

// ─── OTP Email ───────────────────────────────────────────────────────────────
export async function sendOtpEmail(
  to: string,
  code: string,
): Promise<{ sent: boolean }> {
  return sendViaResend(
    to,
    "Your DARI SIR Login OTP",
    `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <div style="text-align:center;margin-bottom:32px">
        <span style="display:inline-block;background:#1B5E20;color:#fff;padding:10px 28px;border-radius:8px;font-weight:900;font-size:22px;letter-spacing:2px">DARI SIR</span>
      </div>
      <h1 style="color:#1B5E20;text-align:center;margin:0 0 8px;font-size:22px">Login Verification</h1>
      <p style="color:#555;text-align:center;font-size:15px;margin:0 0 32px">Use this code to log in to your DARI SIR account:</p>
      <div style="background:#f0f7f0;border:2px solid #1B5E20;border-radius:14px;padding:28px;text-align:center;margin-bottom:24px">
        <span style="font-size:52px;font-weight:900;letter-spacing:10px;color:#1B5E20">${code}</span>
      </div>
      <p style="color:#888;text-align:center;font-size:14px;margin:0 0 8px">&#9200; Valid for <b>5 minutes</b></p>
      <p style="color:#d32f2f;text-align:center;font-size:13px;margin:0">&#9888;&#65039; Do not share this code with anyone</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px">
      <p style="color:#aaa;text-align:center;font-size:12px;margin:0">If you didn't request this, you can safely ignore this email.</p>
    </div>`,
  );
}

// ─── Password Changed Email ──────────────────────────────────────────────────
export async function sendPasswordChangedEmail(
  to: string,
): Promise<{ sent: boolean }> {
  const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });

  return sendViaResend(
    to,
    "DARI SIR — Password Changed Successfully",
    `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <div style="text-align:center;margin-bottom:32px">
        <span style="display:inline-block;background:#1B5E20;color:#fff;padding:10px 28px;border-radius:8px;font-weight:900;font-size:22px;letter-spacing:2px">DARI SIR</span>
      </div>
      <h1 style="color:#1B5E20;text-align:center;margin:0 0 24px">&#9989; Password Changed</h1>
      <p style="color:#555;text-align:center;font-size:16px;margin:0 0 16px">Your DARI SIR account password was successfully changed.</p>
      <p style="color:#555;text-align:center;font-size:16px;margin:0 0 32px"><b>${now}</b> (Nepal Time)</p>
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px">
        <p style="color:#856404;font-size:14px;margin:0">&#9888;&#65039; If you did not make this change, <b>contact support immediately</b></p>
      </div>
      <p style="color:#888;text-align:center;font-size:13px;margin:0">For security, your previous sessions have been invalidated.</p>
    </div>`,
  );
}
