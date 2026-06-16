import "server-only";

// SMTP2GO REST API — https://www.smtp2go.com/docs/api-v3/email-send
// Free tier: 1000 emails/month, NO domain verification needed
// Sends to ANY email address from any sender address.

const SMTP2GO_API_URL = "https://api.smtp2go.com/v3/email/send";

const SENDER_EMAIL = "noreply@darisir.com";
const SENDER_NAME = "DARI SIR";

// ─── Shared SMTP2GO send helper ──────────────────────────────────────────────
async function sendViaSmtp2go(
  to: string,
  subject: string,
  html: string,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.SMTP2GO_API_KEY;
  if (!apiKey) {
    console.log(`[DARI SIR] SMTP2GO_API_KEY not set — email to ${to} not sent`);
    return { sent: false };
  }

  try {
    const res = await fetch(SMTP2GO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        sender: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: [to],
        subject,
        html_body: html,
      }),
    });

    const data = await res.json();

    if (!data.data?.succeeded) {
      console.error(`SMTP2GO API error:`, data.data?.error || JSON.stringify(data));
      return { sent: false };
    }

    console.log(`[DARI SIR] Email sent to ${to} — id: ${data.data?.email_id}`);
    return { sent: true };
  } catch (e) {
    console.error("sendViaSmtp2go error:", (e as Error).message);
    return { sent: false };
  }
}

// ─── OTP Email ───────────────────────────────────────────────────────────────
export async function sendOtpEmail(
  to: string,
  code: string,
): Promise<{ sent: boolean }> {
  return sendViaSmtp2go(
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

  return sendViaSmtp2go(
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
