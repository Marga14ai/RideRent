const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db/database');
const { uploader } = require('../middleware/uploads');
const { sendMail } = require('../services/emailService');
const { ageOnDate } = require('../utils/rental');
const config = require('../config/appConfig');

const {normalizeMobile,mobileOwner}=require('../utils/mobile');
const router = express.Router();
const registrationUpload = uploader('ids', 'id').fields([{ name: 'license', maxCount: 1 }]);

router.get('/login', (req, res) => res.render('auth/login', { title: 'Sign In' }));
router.post('/login', (req, res) => {
  const { password } = req.body;
  const identifier=String(req.body.identifier||req.body.email||'').trim();
  let user;
  if(!identifier.includes('@')){
    const mobile=normalizeMobile(identifier);
    const matches=mobile?db.prepare('SELECT * FROM users').all().filter(u=>normalizeMobile(u.contact)===mobile):[];
    if(matches.length===1)user=matches[0];
  } else user=db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(identifier||req.body.email||'').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    req.session.flash = { type: 'danger', message: 'Invalid email/mobile number or password.' };
    return res.redirect('/login');
  }
  if (!user.is_active) {
    req.session.flash = { type: 'danger', message: 'This account is inactive.' };
    return res.redirect('/login');
  }
  req.session.user = { id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name, email: user.email };
  const dest = req.session.returnTo || (user.role === 'admin' ? '/admin' : '/customer');
  delete req.session.returnTo;
  res.redirect(dest);
});

router.get('/register', (req, res) => res.render('auth/register', { title: 'Create Account' }));
router.post('/register', registrationUpload, (req, res) => {
  try {
    const { first_name, last_name, email, contact, address, birth_date, password, confirm_password } = req.body;
    if (!first_name || !last_name || !email || !birth_date || !password) throw new Error('Please complete all required fields.');
    if (!normalizeMobile(contact)) throw new Error('Enter a valid Philippine mobile number (09xxxxxxxxx or +639xxxxxxxxx).');
    if (mobileOwner(db,contact)) throw new Error('Mobile number is already registered.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (password !== confirm_password) throw new Error('Passwords do not match.');
    if (!require('../utils/birthday').isValidBirthday(birth_date)) throw new Error('Enter a real birth date that is not in the future.');
    if (ageOnDate(birth_date) < config.minimumAge) throw new Error(`You must be at least ${config.minimumAge} years old.`);
    if (!req.files?.license?.[0]) throw new Error('A driver\'s license is required.');
    if (db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email)) throw new Error('Email is already registered.');
    db.prepare(`INSERT INTO users (role,first_name,last_name,email,password_hash,contact,address,birth_date,valid_id_path,license_path)
      VALUES ('customer',?,?,?,?,?,?,?,?,?)`).run(
      first_name.trim(), last_name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), normalizeMobile(contact), address || '', birth_date,
      null, `/uploads/ids/${req.files.license[0].filename}`
    );
    req.session.flash = { type: 'success', message: 'Account created. You may now sign in.' };
    res.redirect('/login');
  } catch (e) {
    req.session.flash = { type: 'danger', message: e.message };
    res.redirect('/register');
  }
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

router.get('/forgot-password', (req, res) => res.render('auth/forgot', { title: 'Forgot Password' }));
router.post('/forgot-password', async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(req.body.email || '');
  if (user) {
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,?)').run(user.id, token, expires);
    const link = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password/${token}`;
    await sendMail(user.email, 'RideRent password reset', `<p>Reset your password within one hour:</p><p><a href="${link}">${link}</a></p>`);
    console.log('Password reset link:', link);
  }
  req.session.flash = { type: 'info', message: 'If that email exists, a reset link was sent. In demo mode, the link also appears in the server console.' };
  res.redirect('/login');
});

router.get('/reset-password/:token', (req, res) => {
  const row = db.prepare("SELECT * FROM password_resets WHERE token=? AND used=0 AND datetime(expires_at) > datetime('now')").get(req.params.token);
  if (!row) return res.status(400).render('errors/message', { title: 'Invalid Link', message: 'This reset link is invalid or expired.' });
  res.render('auth/reset', { title: 'Reset Password', token: req.params.token });
});
router.post('/reset-password/:token', (req, res) => {
  const row = db.prepare("SELECT * FROM password_resets WHERE token=? AND used=0 AND datetime(expires_at) > datetime('now')").get(req.params.token);
  if (!row) return res.status(400).render('errors/message', { title: 'Invalid Link', message: 'This reset link is invalid or expired.' });
  if (!req.body.password || req.body.password.length < 8 || req.body.password !== req.body.confirm_password) {
    req.session.flash = { type: 'danger', message: 'Passwords must match and be at least 8 characters.' };
    return res.redirect(`/reset-password/${req.params.token}`);
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.password, 10), row.user_id);
    db.prepare('UPDATE password_resets SET used=1 WHERE id=?').run(row.id);
  });
  tx();
  req.session.flash = { type: 'success', message: 'Password updated. Please sign in.' };
  res.redirect('/login');
});

module.exports = router;
