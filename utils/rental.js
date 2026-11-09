const db = require('../db/database');
const config = require('../config/appConfig');

function dateOnly(s) { return new Date(`${s}T00:00:00`); }
function daysInclusive(start, end) {
  const ms = dateOnly(end) - dateOnly(start);
  return Math.floor(ms / 86400000) + 1;
}
function ageOnDate(birthDate, on = new Date()) {
  const b = new Date(`${birthDate}T00:00:00`);
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--;
  return age;
}
function isVehicleAvailable(vehicleId, startDate, endDate, excludeBookingId = null) {
  const v=db.prepare('SELECT * FROM vehicles WHERE id=?').get(vehicleId);
  if(!v||!require('../services/registrationService').validRegistration(v,endDate)) return false;
  let sql = `SELECT COUNT(*) AS c FROM bookings
             WHERE vehicle_id=? AND booking_status IN ('Confirmed','Ongoing')
             AND NOT (date(end_date) < date(?) OR date(start_date) > date(?))`;
  const args = [vehicleId, startDate, endDate];
  if (excludeBookingId) { sql += ' AND id != ?'; args.push(excludeBookingId); }
  return db.prepare(sql).get(...args).c === 0;
}
function bookingCode() {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get();
  return `RR-${year}-${String((row?.id || 0) + 1).padStart(4,'0')}`;
}
function expireStaleReservations() {
  const rows = db.prepare(`SELECT * FROM bookings WHERE booking_status='Confirmed'
    AND payment_method='Online Transfer' AND payment_status='Unpaid'
    AND datetime(created_at) <= datetime('now', ?)`)
    .all(`-${config.reservationExpiryHours} hours`);
  const upd = db.prepare("UPDATE bookings SET booking_status='Expired', updated_at=CURRENT_TIMESTAMP WHERE id=?");
  rows.forEach(r => upd.run(r.id));
}
function lateInfo(booking, returnedAt = new Date()) {
  const due = new Date(`${booking.end_date}T${booking.return_time || '18:00'}:00`);
  const diff = returnedAt - due;
  if (diff <= 0) return { hours: 0, penalty: 0 };
  const hours = Math.ceil(diff / 3600000);
  return { hours, penalty: hours * config.latePenaltyPerHour };
}

module.exports = { daysInclusive, ageOnDate, isVehicleAvailable, bookingCode, expireStaleReservations, lateInfo };
