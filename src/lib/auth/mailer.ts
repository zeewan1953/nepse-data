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
    subject: "Your DARI SIR verification code",
    text: `Your DARI SIR verification code is ${code}. It is valid for 5 minutes.`,
    html: `<div style="font-family:system-ui,Arial,sans-serif">
      <h2 style="color:#1d72d2">DARI SIR</h2>
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:4px;color:#0b2545">${code}</p>
      <p style="color:#5b7aa3">Valid for 5 minutes. If you didn't request this, ignore this email.</p>
    </div>`,
  });
  return { sent: true };
}
