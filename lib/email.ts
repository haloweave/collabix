// Transactional email. When SMTP is configured (SMTP_HOST + EMAIL_FROM) mail is
// sent for real via nodemailer — point it at any SMTP provider (AWS SES SMTP,
// SendGrid, Mailgun, Postmark…). With no SMTP config it falls back to logging
// to the server console, which is how the dev OTP flow works.

type Mail = { to: string; subject: string; text: string; html?: string };

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const from = process.env.EMAIL_FROM;
  if (!host || !from) return null;
  return {
    host,
    from,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
}

export async function sendEmail(mail: Mail): Promise<void> {
  const cfg = smtpConfig();
  if (!cfg) {
    console.log(
      `[email:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`,
    );
    return;
  }

  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transport.sendMail({
    from: cfg.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
