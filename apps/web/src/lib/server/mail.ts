import nodemailer from 'nodemailer'

interface ResetMailInput {
  email: string
  token: string
}

export async function sendPasswordResetEmail({ email, token }: ResetMailInput): Promise<void> {
  const appUrl = process.env.APP_URL || 'http://localhost:3210'
  const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`

  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    console.log(`[XEgineer] Password reset link for ${email}: ${resetUrl}`)
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: '重置 XEgineer 密码',
    text: `请打开以下链接重置密码，链接 30 分钟内有效：\n\n${resetUrl}`,
    html: `<p>请打开以下链接重置密码，链接 30 分钟内有效：</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  })
}
