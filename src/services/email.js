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

/**
 * Send professional email when a transcript is shared with a user.
 * @param {string} to - Recipient email
 * @param {string} sharerName - Name of person who shared
 * @param {string} sharerEmail - Email of person who shared
 */
export async function sendTranscriptShareEmail(to, sharerName, sharerEmail) {
  const appName = 'Record AI'
  const subject = `${sharerName} shared a transcript with you – ${appName}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
          <tr>
            <td style="padding: 40px 40px 24px 40px; background: linear-gradient(135deg, #5810fa 0%, #8b5cf6 100%);">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">${appName}</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.9);">Transcript shared with you</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 40px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151;">Hello,</p>
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #4b5563;">
                <strong>${sharerName}</strong> (${sharerEmail}) has shared a transcript with you on ${appName}.
              </p>
              <p style="margin: 0 0 28px 0; font-size: 15px; color: #6b7280;">
                Sign in to your account to view, listen, and chat with the transcript content.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(135deg, #5810fa 0%, #8b5cf6 100%);">
                    <a href="${process.env.APP_URL || '#'}" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">Open in ${appName}</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 28px 0 0 0; font-size: 13px; color: #9ca3af;">
                If you don't have an account, you'll need to sign up first. If you weren't expecting this email, you can safely ignore it.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 24px 0;" />
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    subject,
    html,
  }
  await transporter.sendMail(mailOptions)
}
