import "server-only";
import nodemailer from "nodemailer";

// Sends the OTP email via SMTP when configured (env vars). When SMTP is not
// configured it falls back to logging the code and returning it as `devCode`
// so development still works without an email provider.
export async function sendOtpEmail(
  to: string,
  code: string,
): Promise<{ sent: boolean; devCode?: string }> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`\n[DARI SIR OTP] ${to} -> ${code} (set SMTP_* env vars to email it)\n`);
    return { sent: false, devCode: code };
  }

  const port = Number(SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transport.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: `DARI SIR — Login Code: ${code}`,
    text: `Your DARI SIR login code is ${code}. It is valid for 5 minutes. Do not share this code with anyone.`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <div style="text-align:center;margin-bottom:32px">
        <span style="display:inline-block;background:#1B5E20;color:#fff;padding:8px 24px;border-radius:8px;font-weight:900;font-size:20px">DARI SIR</span>
      </div>
      <h1 style="color:#1B5E20;text-align:center;margin:0 0 24px">Login Verification</h1>
      <p style="color:#555;text-align:center;font-size:16px;margin:0 0 32px">Use this code to log in to your DARI SIR account:</p>
      <div style="background:#f0f7f0;border:2px solid #1B5E20;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
        <span style="font-size:48px;font-weight:900;letter-spacing:8px;color:#1B5E20">${code}</span>
      </div>
      <p style="color:#888;text-align:center;font-size:14px;margin:0 0 8px">⏱️ Valid for <b>5 minutes</b></p>
      <p style="color:#d32f2f;text-align:center;font-size:13px;margin:0">⚠️ Do not share this code with anyone</p>
    </div>`,
  });
  return { sent: true };
}

export async function sendPasswordChangedEmail(
  to: string,
): Promise<{ sent: boolean }> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`\n[DARI SIR Password Changed] ${to} (set SMTP_* env vars to email it)\n`);
    return { sent: false };
  }

  const port = Number(SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });

  await transport.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: "DARI SIR — Password Changed Successfully",
    text: `Your DARI SIR password was changed on ${now}. If you did not make this change, contact support immediately.`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <div style="text-align:center;margin-bottom:32px">
        <span style="display:inline-block;background:#1B5E20;color:#fff;padding:8px 24px;border-radius:8px;font-weight:900;font-size:20px">DARI SIR</span>
      </div>
      <h1 style="color:#1B5E20;text-align:center;margin:0 0 24px">✅ Password Changed</h1>
      <p style="color:#555;text-align:center;font-size:16px;margin:0 0 16px">Your DARI SIR account password was successfully changed.</p>
      <p style="color:#555;text-align:center;font-size:16px;margin:0 0 32px"><b>${now}</b> (Nepal Time)</p>
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px">
        <p style="color:#856404;font-size:14px;margin:0">⚠️ If you did not make this change, <b>contact support immediately</b></p>
      </div>
      <p style="color:#888;text-align:center;font-size:13px;margin:0">For security, your previous sessions have been invalidated.</p>
    </div>`,
  });
  return { sent: true };
}
