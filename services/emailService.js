const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

async function sendMail(to, subject, html) {
  const t = getTransporter();
  if (!t) {
    console.log(`[RideRent email demo] To: ${to} | ${subject}`);
    return { demo: true };
  }
  return t.sendMail({ from: process.env.MAIL_FROM || 'RideRent <no-reply@riderent.local>', to, subject, html });
}

module.exports = { sendMail };
