const express = require('express');
const db = require('../db/database');
const { requireCustomer } = require('../middleware/auth');
const { uploader } = require('../middleware/uploads');
const { daysInclusive, isVehicleAvailable, bookingCode } = require('../utils/rental');
const { notify, notifyAdmins } = require('../services/notificationService');

const router = express.Router();
const paymentUpload = uploader('payment-proofs', 'payment').single('proof');
router.use(requireCustomer);

router.get('/', (req, res) => {
  const uid = req.session.user.id;
  const active = db.prepare(`SELECT b.*,v.brand,v.model,v.image FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id
    WHERE b.user_id=? AND b.booking_status IN ('Confirmed','Ongoing') ORDER BY b.start_date LIMIT 3`).all(uid);
  const stats = {
    total: db.prepare('SELECT COUNT(*) c FROM bookings WHERE user_id=?').get(uid).c,
    active: db.prepare("SELECT COUNT(*) c FROM bookings WHERE user_id=? AND booking_status IN ('Confirmed','Ongoing')").get(uid).c,
    due: db.prepare("SELECT COALESCE(SUM(total_amount + late_penalty - amount_paid),0) s FROM bookings WHERE user_id=? AND booking_status!='Cancelled'").get(uid).s
  };
  const notes = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 5').all(uid);
  res.render('customer/dashboard', { title: 'Customer Dashboard', active, stats, notes });
});

router.get('/book/:vehicleId', (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id=? AND status NOT IN ('Archived','Unavailable','Maintenance')").get(req.params.vehicleId);
  if (!vehicle) return res.status(404).render('errors/message', { title: 'Vehicle unavailable', message: 'This vehicle is currently unavailable.' });
  res.render('customer/book', { title: 'Book Vehicle', vehicle });
});

router.post('/book/:vehicleId', paymentUpload, async (req, res) => {
  try {
    const uid = req.session.user.id;
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.vehicleId);
    if (!vehicle || ['Archived','Unavailable','Maintenance'].includes(vehicle.status)) throw new Error('Vehicle is unavailable.');
    if (!user.license_path) throw new Error('A driver\'s license is required before booking.');
    const { start_date, end_date, pickup_time, return_time, payment_choice, payment_reference, terms } = req.body;
    if (!start_date || !end_date || !payment_choice || !terms) throw new Error('Please complete all booking fields and accept the rental terms.');
    const paymentMethod = payment_choice === 'location' ? 'Pay at Location' : 'Online Transfer';
    const paymentOption = payment_choice === 'online_down' ? '50% Downpayment' : 'Full Payment';
    if (!['online_down','online_full','location'].includes(payment_choice)) throw new Error('Choose a valid payment option.');
    if (paymentMethod === 'Online Transfer' && !req.file) throw new Error('Attach your transfer proof to continue.');
    const today = new Date(); today.setHours(0,0,0,0);
    if (new Date(`${start_date}T00:00:00`) < today) throw new Error('Start date cannot be in the past.');
    const totalDays = daysInclusive(start_date, end_date);
    if (totalDays <= 0) throw new Error('Return date must be on or after the pickup date.');
    if (!require('../services/registrationService').validRegistration(vehicle,end_date)) throw new Error('This motorcycle needs valid OR/CR and registration covering your rental dates.');
    if (!isVehicleAvailable(vehicle.id, start_date, end_date)) throw new Error('This vehicle is already booked for the selected dates.');
    const total = totalDays * vehicle.daily_rate;
    const expected = paymentOption === '50% Downpayment' ? total * 0.5 : paymentMethod === 'Online Transfer' ? total : 0;
    const pStatus = paymentMethod === 'Online Transfer' ? 'Pending Verification' : 'Unpaid';
    const code = bookingCode();
    const result = db.prepare(`INSERT INTO bookings
      (booking_code,user_id,vehicle_id,start_date,end_date,pickup_time,return_time,total_days,daily_rate,total_amount,payment_option,payment_method,payment_status,proof_path,payment_reference)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, uid, vehicle.id, start_date, end_date, pickup_time || '09:00', return_time || '18:00', totalDays, vehicle.daily_rate, total, paymentOption, paymentMethod, pStatus, req.file ? `/uploads/payment-proofs/${req.file.filename}` : null, payment_reference || null);
    if (paymentMethod === 'Online Transfer' && req.file) {
      db.prepare(`INSERT INTO payments (booking_id,user_id,amount,method,status,proof_path,reference_no)
                  VALUES (?,?,?,?,?,?,?)`).run(result.lastInsertRowid, uid, expected, 'Online Transfer', 'Pending Verification', `/uploads/payment-proofs/${req.file.filename}`, payment_reference || '');
      notifyAdmins('Payment proof submitted', `${user.first_name} ${user.last_name} submitted payment proof for ${code}.`);
    }
    await notify(uid, 'Booking confirmed', `${code} is confirmed for ${vehicle.brand} ${vehicle.model}. Your selected dates have been reserved.`);
    req.session.flash = { type: 'success', message: `Booking ${code} confirmed successfully.` };
    res.redirect(`/customer/bookings/${result.lastInsertRowid}`);
  } catch (e) {
    req.session.flash = { type: 'danger', message: e.message };
    res.redirect(`/customer/book/${req.params.vehicleId}`);
  }
});

router.get('/bookings', (req, res) => {
  const bookings = db.prepare(`SELECT b.*,v.brand,v.model,v.type,v.image FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.user_id=? ORDER BY b.id DESC`).all(req.session.user.id);
  res.render('customer/bookings', { title: 'My Bookings', bookings });
});

router.get('/bookings/:id', (req, res) => {
  const booking = db.prepare(`SELECT b.*,v.brand,v.model,v.type,v.image,v.plate_number FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.id=? AND b.user_id=?`).get(req.params.id, req.session.user.id);
  if (!booking) return res.status(404).render('errors/404', { title: 'Not found' });
  const payments = db.prepare('SELECT * FROM payments WHERE booking_id=? ORDER BY id DESC').all(booking.id);
  const damages = db.prepare('SELECT * FROM damage_charges WHERE booking_id=? ORDER BY id DESC').all(booking.id);
  const extensions = db.prepare('SELECT * FROM extensions WHERE booking_id=? ORDER BY id DESC').all(booking.id);
  const review = db.prepare('SELECT * FROM reviews WHERE booking_id=?').get(booking.id);
  res.render('customer/booking-detail', { title: booking.booking_code, booking, payments, damages, extensions, review });
});

router.post('/bookings/:id/cancel', async (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(req.params.id, req.session.user.id);
  if (!booking) return res.status(404).render('errors/404', { title: 'Not found' });
  if (!['Confirmed'].includes(booking.booking_status)) {
    req.session.flash = { type: 'danger', message: 'This booking can no longer be cancelled.' };
    return res.redirect(`/customer/bookings/${booking.id}`);
  }
  const start = new Date(`${booking.start_date}T${booking.pickup_time}:00`);
  if (new Date() >= start) {
    req.session.flash = { type: 'danger', message: 'Cancellation is only allowed before the rental starts.' };
    return res.redirect(`/customer/bookings/${booking.id}`);
  }
  const refund = booking.amount_paid > 0 ? 'Refund Due' : 'None';
  db.prepare("UPDATE bookings SET booking_status='Cancelled', refund_status=?, payment_status=CASE WHEN amount_paid>0 THEN 'Refund Due' ELSE payment_status END, cancellation_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(refund, req.body.reason || 'Cancelled by customer', booking.id);
  await notify(req.session.user.id, 'Booking cancelled', `${booking.booking_code} was cancelled.${booking.amount_paid > 0 ? ' Your paid amount is marked for refund.' : ''}`);
  notifyAdmins('Booking cancelled', `${booking.booking_code} was cancelled by the customer.`);
  req.session.flash = { type: 'success', message: 'Booking cancelled successfully.' };
  res.redirect(`/customer/bookings/${booking.id}`);
});

router.post('/bookings/:id/extend', async (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(req.params.id, req.session.user.id);
    if (!booking || !['Confirmed','Ongoing'].includes(booking.booking_status)) throw new Error('Only active bookings can be extended.');
    const newEnd = req.body.new_end_date;
    if (!newEnd || new Date(`${newEnd}T00:00:00`) <= new Date(`${booking.end_date}T00:00:00`)) throw new Error('Choose a date after the current return date.');
    if (!require('../services/registrationService').validRegistration(db.prepare('SELECT * FROM vehicles WHERE id=?').get(booking.vehicle_id),newEnd)) throw new Error('Registration does not cover the requested extension.');
    if (!isVehicleAvailable(booking.vehicle_id, booking.start_date, newEnd, booking.id)) throw new Error('Extension is unavailable because another booking conflicts with the requested date.');
    const oldDays = booking.total_days;
    const newDays = daysInclusive(booking.start_date, newEnd);
    const extraDays = newDays - oldDays;
    const extraAmount = extraDays * booking.daily_rate;
    const newTotal = booking.total_amount + extraAmount;
    const newPayStatus = booking.amount_paid >= newTotal ? 'Paid' : (booking.amount_paid > 0 ? 'Partially Paid' : booking.payment_status);
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO extensions (booking_id,requested_end_date,status,additional_days,additional_amount) VALUES (?,?,?,?,?)').run(booking.id, newEnd, 'Approved', extraDays, extraAmount);
      db.prepare('UPDATE bookings SET end_date=?,total_days=?,total_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newEnd, newDays, newTotal, newPayStatus, booking.id);
    }); tx();
    await notify(req.session.user.id, 'Extension approved', `${booking.booking_code} was extended to ${newEnd}. Additional amount: ₱${extraAmount.toFixed(2)}.`);
    req.session.flash = { type: 'success', message: 'Extension approved automatically. No conflicting reservation was found.' };
  } catch (e) { req.session.flash = { type: 'danger', message: e.message }; }
  res.redirect(`/customer/bookings/${req.params.id}`);
});

router.post('/bookings/:id/payment', paymentUpload, async (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(req.params.id, req.session.user.id);
    if (!booking || booking.booking_status==='Cancelled') throw new Error('This booking cannot receive another payment.');
    if (booking.payment_method!=='Online Transfer') throw new Error('This booking is set to pay at the pickup location.');
    if (!req.file) throw new Error('Please attach payment proof.');
    const amount = Number(req.body.amount || 0);
    const balance = Math.max(0,Number(booking.total_amount)+Number(booking.late_penalty)-Number(booking.amount_paid));
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance + 0.001) throw new Error('Enter a valid amount up to the remaining balance.');
    if (db.prepare("SELECT id FROM payments WHERE booking_id=? AND status='Pending Verification'").get(booking.id)) throw new Error('A payment is already waiting for shop verification.');
    db.transaction(()=>{
      db.prepare(`INSERT INTO payments (booking_id,user_id,amount,method,status,proof_path,reference_no)
        VALUES (?,?,?,?,?,?,?)`).run(booking.id, req.session.user.id, amount, 'Online Transfer', 'Pending Verification', `/uploads/payment-proofs/${req.file.filename}`, req.body.reference_no || '');
      db.prepare("UPDATE bookings SET payment_status='Pending Verification', proof_path=?, payment_reference=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(`/uploads/payment-proofs/${req.file.filename}`, req.body.reference_no || '', booking.id);
    })();
    notifyAdmins('Payment proof submitted', `New payment proof was submitted for ${booking.booking_code}.`);
    req.session.flash = { type: 'success', message: 'Payment proof submitted for admin verification.' };
  } catch (e) { req.session.flash = { type: 'danger', message: e.message }; }
  res.redirect(`/customer/bookings/${req.params.id}`);
});
router.post('/bookings/:id/review', (req, res) => {
  try {
    const booking = db.prepare("SELECT * FROM bookings WHERE id=? AND user_id=? AND booking_status='Completed'").get(req.params.id, req.session.user.id);
    if (!booking) throw new Error('Only completed rentals can be reviewed.');
    if (db.prepare('SELECT id FROM reviews WHERE booking_id=?').get(booking.id)) throw new Error('You already reviewed this rental.');
    const rating = Number(req.body.rating);
    if (rating < 1 || rating > 5) throw new Error('Rating must be from 1 to 5.');
    db.prepare('INSERT INTO reviews (booking_id,user_id,vehicle_id,rating,comment) VALUES (?,?,?,?,?)').run(booking.id, req.session.user.id, booking.vehicle_id, rating, req.body.comment || '');
    req.session.flash = { type: 'success', message: 'Thank you for your review.' };
  } catch (e) { req.session.flash = { type: 'danger', message: e.message }; }
  res.redirect(`/customer/bookings/${req.params.id}`);
});

router.post('/reviews/:id/react', (req, res) => {
  const review = db.prepare('SELECT id,vehicle_id FROM reviews WHERE id=?').get(req.params.id);
  if (!review) return res.status(404).render('errors/404', { title: 'Not found' });
  const reaction = req.body.reaction;
  if (!['like','love'].includes(reaction)) return res.status(400).render('errors/message', { title: 'Invalid reaction', message: 'Choose a valid reaction.' });
  const existing = db.prepare('SELECT reaction FROM review_reactions WHERE review_id=? AND user_id=?').get(review.id,req.session.user.id);
  if (existing?.reaction === reaction) db.prepare('DELETE FROM review_reactions WHERE review_id=? AND user_id=?').run(review.id,req.session.user.id);
  else db.prepare(`INSERT INTO review_reactions(review_id,user_id,reaction) VALUES(?,?,?)
    ON CONFLICT(review_id,user_id) DO UPDATE SET reaction=excluded.reaction`).run(review.id,req.session.user.id,reaction);
  res.redirect(`/vehicles/${review.vehicle_id}#review-${review.id}`);
});

router.get('/notifications', (req, res) => {
  const items = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC').all(req.session.user.id);
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.session.user.id);
  res.render('customer/notifications', { title: 'Notifications', items });
});

router.get('/profile', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user.id);
  res.render('customer/profile', { title: 'My Profile', user });
});
router.post('/profile', (req, res) => {
  const {normalizeMobile,mobileOwner}=require('../utils/mobile');
  if(!normalizeMobile(req.body.contact)||mobileOwner(db,req.body.contact,req.session.user.id)){req.session.flash={type:'danger',message:'Enter a valid, unique Philippine mobile number.'};return res.redirect('/customer/profile');}
  req.body.contact=normalizeMobile(req.body.contact);
  db.prepare('UPDATE users SET first_name=?,last_name=?,contact=?,address=? WHERE id=?').run(req.body.first_name, req.body.last_name, req.body.contact, req.body.address, req.session.user.id);
  Object.assign(req.session.user, { first_name: req.body.first_name, last_name: req.body.last_name });
  req.session.flash = { type: 'success', message: 'Profile updated.' };
  res.redirect('/customer/profile');
});

module.exports = router;
