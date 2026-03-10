import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

export async function sendOtpEmail(to, otp) {
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    subject: "Verify your email - Notes AI",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0f; color: #e2e8f0; border-radius: 12px;">
        <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #ffffff;">Notes AI</h2>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #94a3b8;">
          Use the code below to verify your email address:
        </p>
        <div style="background: #1e293b; padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38bdf8;">${otp}</span>
        </div>
        <p style="margin: 0; font-size: 14px; color: #64748b;">
          This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.Thank you.
        </p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}

export async function sendPasswordResetOtpEmail(to, otp) {
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    subject: "Reset your password - Notes AI",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0f; color: #e2e8f0; border-radius: 12px;">
        <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #ffffff;">Notes AI</h2>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #94a3b8;">
          Use the code below to reset your password:
        </p>
        <div style="background: #1e293b; padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38bdf8;">${otp}</span>
        </div>
        <p style="margin: 0; font-size: 14px; color: #64748b;">
          This code expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}
