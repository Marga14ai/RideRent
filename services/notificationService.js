const db = require('../db/database');
const { sendMail } = require('./emailService');

async function notify(userId, title, message, emailSubject = title) {
  db.prepare('INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)').run(userId, title, message);
  const user = db.prepare('SELECT email, first_name FROM users WHERE id=?').get(userId);
  if (user?.email) {
    await sendMail(user.email, emailSubject, `<p>Hello ${user.first_name},</p><p>${message}</p><p>— RideRent</p>`);
  }
}

function notifyAdmins(title, message) {
  const admins = db.prepare("SELECT id FROM users WHERE role='admin' AND is_active=1").all();
  admins.forEach(a => db.prepare('INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)').run(a.id, title, message));
}

module.exports = { notify, notifyAdmins };
