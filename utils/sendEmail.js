const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send an email
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.html
 * @param {string} [options.text]
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'ConnectHub <no-reply@connecthub.app>',
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  };

  await transporter.sendMail(mailOptions);
};

const sendPasswordResetEmail = async (user, resetUrl) => {
  await sendEmail({
    to: user.email,
    subject: 'ConnectHub - Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>Hi ${user.name},</p>
        <p>You requested a password reset for your ConnectHub account. Click the button below to set a new password. This link is valid for 30 minutes.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;margin:16px 0;">Reset Password</a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>${resetUrl}</p>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
        <p>- The ConnectHub Team</p>
      </div>
    `,
  });
};

const sendEmailVerification = async (user, verifyUrl) => {
  await sendEmail({
    to: user.email,
    subject: 'ConnectHub - Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to ConnectHub, ${user.name}!</h2>
        <p>Please verify your email address to activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;margin:16px 0;">Verify Email</a>
        <p>This link is valid for 24 hours.</p>
        <p>- The ConnectHub Team</p>
      </div>
    `,
  });
};

module.exports = { sendEmail, sendPasswordResetEmail, sendEmailVerification };
