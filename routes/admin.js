const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { uploader } = require('../middleware/uploads');
const { lateInfo } = require('../utils/rental');
const { notify } = require('../services/notificationService');

const router = express.Router();
const damageUpload = uploader('damage', 'damage').single('photo');
router.use(requireAdmin);
router.use(require('./admin-tools'));
const docsUpload=uploader('registrations','registration').fields([{name:'or_file',maxCount:1},{name:'cr_file',maxCount:1}]);
function vehicleDocs(req,res,next){
 docsUpload(req,res,err=>{try{
 if(err)throw err;
 const old=req.params.id?db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id):null;
 if(req.params.id&&!old)throw new Error('Vehicle not found.');
 const v=req.body;
 req.documents={or_path:req.files?.or_file?.[0]?'/admin/registration-files/'+req.files.or_file[0].filename:old?.or_path||null,cr_path:req.files?.cr_file?.[0]?'/admin/registration-files/'+req.files.cr_file[0].filename:old?.cr_path||null,registration_expiry:v.registration_expiry||null};
 const d=req.documents;
 if(v.type==='Motorcycle'&&(!d.or_path||!d.cr_path||!d.registration_expiry))throw new Error('Motorcycles require both OR and CR uploads and a registration expiry date.');
 if(d.registration_expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(d.registration_expiry)||!Number.isFinite(Date.parse(d.registration_expiry))||new Date(d.registration_expiry).toISOString().slice(0,10)!==d.registration_expiry))throw new Error('Invalid registration expiry date.');
 if(v.type==='Motorcycle'&&v.status==='Available'&&d.registration_expiry<new Date().toISOString().slice(0,10))throw new Error('Expired registration cannot be marked Available.');
 if(!['Car','Motorcycle'].includes(v.type)||!v.brand?.trim()||!v.model?.trim()||!v.plate_number?.trim()||!Number.isFinite(Number(v.daily_rate))||Number(v.daily_rate)<=0)throw new Error('Enter valid vehicle details and a positive daily rate.');
 next();
 }catch(e){for(const files of Object.values(req.files||{}))for(const file of files)require('fs').unlinkSync(file.path);req.session.flash={type:'danger',message:e.message};res.redirect(req.params.id?'/admin/vehicles/'+req.params.id+'/edit':'/admin/vehicles/new');}});
}
router.get('/registration-files/:name',(req,res)=>{if(!/^registration-[\w-]+\.(pdf|png|jpe?g|webp)$/.test(req.params.name))return res.sendStatus(404);res.set('X-Content-Type-Options','nosniff');res.sendFile(req.params.name,{root:require('path').join(__dirname,'../private/registrations')});});


router.get('/', (req, res) => {
  const stats = {
    vehicles: db.prepare("SELECT COUNT(*) c FROM vehicles WHERE status!='Archived'").get().c,
    available: db.prepare("SELECT COUNT(*) c FROM vehicles WHERE status='Available'").get().c,
    rented: db.prepare("SELECT COUNT(*) c FROM vehicles WHERE status='Rented'").get().c,
    customers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'").get().c,
    pendingPayments: db.prepare("SELECT COUNT(*) c FROM payments WHERE status='Pending Verification'").get().c,
    revenue: db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='Verified'").get().s
  };
  const recent = db.prepare(`SELECT b.*,u.first_name,u.last_name,v.brand,v.model FROM bookings b JOIN users u ON u.id=b.user_id JOIN vehicles v ON v.id=b.vehicle_id ORDER BY b.id DESC LIMIT 8`).all();
  const monthly = db.prepare(`SELECT substr(created_at,1,7) month, COUNT(*) count FROM bookings GROUP BY substr(created_at,1,7) ORDER BY month DESC LIMIT 6`).all().reverse();
  res.render('admin/dashboard', { title: 'Admin Dashboard', stats, recent, monthly });
});

router.get('/vehicles', (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles ORDER BY id DESC').all();
  res.render('admin/vehicles', { title: 'Vehicle Management', vehicles });
});
router.get('/vehicles/new', (req, res) => res.render('admin/vehicle-form', { title: 'Add Vehicle', vehicle: null }));
router.post('/vehicles', vehicleDocs, (req, res) => {
  try {
    const v = req.body;
    db.prepare(`INSERT INTO vehicles (type,brand,model,year,plate_number,color,transmission,fuel_type,seats,engine_cc,helmet_included,daily_rate,description,status,image,or_path,cr_path,registration_expiry)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(v.type,v.brand,v.model,Number(v.year)||null,v.plate_number,v.color,v.transmission,v.fuel_type,Number(v.seats)||null,Number(v.engine_cc)||null,v.helmet_included?1:0,Number(v.daily_rate),v.description,v.status||'Available',v.image|| (v.type==='Car'?'/images/car.svg':'/images/motorcycle.svg'),req.documents.or_path,req.documents.cr_path,req.documents.registration_expiry);
    require('../services/registrationService').checkReminders();
    req.session.flash = { type: 'success', message: 'Vehicle added.' };
    res.redirect('/admin/vehicles');
  } catch(e) { req.session.flash={type:'danger',message:e.message}; res.redirect('/admin/vehicles/new'); }
});
router.get('/vehicles/:id/edit', (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  if (!vehicle) return res.status(404).render('errors/404',{title:'Not found'});
  res.render('admin/vehicle-form', { title: 'Edit Vehicle', vehicle });
});
router.post('/vehicles/:id', vehicleDocs, (req, res) => {
  try {
  const v=req.body;
  db.prepare(`UPDATE vehicles SET type=?,brand=?,model=?,year=?,plate_number=?,color=?,transmission=?,fuel_type=?,seats=?,engine_cc=?,helmet_included=?,daily_rate=?,description=?,status=?,image=?,or_path=?,cr_path=?,registration_expiry=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(v.type,v.brand,v.model,Number(v.year)||null,v.plate_number,v.color,v.transmission,v.fuel_type,Number(v.seats)||null,Number(v.engine_cc)||null,v.helmet_included?1:0,Number(v.daily_rate),v.description,v.status,v.image|| (v.type==='Car'?'/images/car.svg':'/images/motorcycle.svg'),req.documents.or_path,req.documents.cr_path,req.documents.registration_expiry,req.params.id);
  require('../services/registrationService').checkReminders();
  req.session.flash={type:'success',message:'Vehicle updated.'}; res.redirect('/admin/vehicles');
  } catch(e) { req.session.flash={type:'danger',message:e.message};res.redirect('/admin/vehicles/'+req.params.id+'/edit'); }
});
router.post('/vehicles/:id/delete', (req,res)=>{
  const used=db.prepare('SELECT COUNT(*) c FROM bookings WHERE vehicle_id=?').get(req.params.id).c;
  if(used){ db.prepare("UPDATE vehicles SET status='Archived' WHERE id=?").run(req.params.id); req.session.flash={type:'info',message:'Vehicle has rental history, so it was archived instead of permanently deleted.'}; }
  else { db.prepare('DELETE FROM vehicles WHERE id=?').run(req.params.id); req.session.flash={type:'success',message:'Vehicle deleted.'}; }
  res.redirect('/admin/vehicles');
});

router.get('/bookings', (req,res)=>{
  const bookings=db.prepare(`SELECT b.*,u.first_name,u.last_name,v.brand,v.model FROM bookings b JOIN users u ON u.id=b.user_id JOIN vehicles v ON v.id=b.vehicle_id ORDER BY b.id DESC`).all();
  res.render('admin/bookings',{title:'Booking Management',bookings});
});
router.get('/bookings/:id',(req,res)=>{
  const booking=db.prepare(`SELECT b.*,u.first_name,u.last_name,u.email,u.contact,v.brand,v.model,v.plate_number,v.type FROM bookings b JOIN users u ON u.id=b.user_id JOIN vehicles v ON v.id=b.vehicle_id WHERE b.id=?`).get(req.params.id);
  if(!booking) return res.status(404).render('errors/404',{title:'Not found'});
  const payments=db.prepare('SELECT * FROM payments WHERE booking_id=? ORDER BY id DESC').all(booking.id);
  const damages=db.prepare('SELECT * FROM damage_charges WHERE booking_id=? ORDER BY id DESC').all(booking.id);
  res.render('admin/booking-detail',{title:booking.booking_code,booking,payments,damages});
});
router.post('/bookings/:id/pickup',async(req,res)=>{
  const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if(b && b.booking_status==='Confirmed'){
    const vehicle=db.prepare('SELECT * FROM vehicles WHERE id=?').get(b.vehicle_id);
    if(!require('../services/registrationService').validRegistration(vehicle,b.end_date)){req.session.flash={type:'danger',message:'Update the motorcycle registration before releasing it.'};return res.redirect('/admin/bookings/'+b.id);}
    const tx=db.transaction(()=>{db.prepare("UPDATE bookings SET booking_status='Ongoing',actual_pickup_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(b.id);db.prepare("UPDATE vehicles SET status='Rented' WHERE id=?").run(b.vehicle_id);});tx();
    await notify(b.user_id,'Vehicle released',`${b.booking_code} is now marked as ongoing.`);
    req.session.flash={type:'success',message:'Pickup confirmed and rental marked ongoing.'};
  }
  res.redirect(`/admin/bookings/${req.params.id}`);
});
router.post('/bookings/:id/return',async(req,res)=>{
  const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if(b && b.booking_status==='Ongoing'){
    const info=lateInfo(b,new Date());
    const tx=db.transaction(()=>{db.prepare("UPDATE bookings SET booking_status='Completed',actual_return_at=CURRENT_TIMESTAMP,late_hours=?,late_penalty=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(info.hours,info.penalty,b.id);db.prepare("UPDATE vehicles SET status='Available' WHERE id=? AND status='Rented'").run(b.vehicle_id);});tx();
    await notify(b.user_id,'Rental completed',`${b.booking_code} was returned.${info.penalty>0?` Late fee: ₱${info.penalty.toFixed(2)}.`:''}`);
    req.session.flash={type:'success',message:`Return confirmed. Late fee: ₱${info.penalty.toFixed(2)}.`};
  }
  res.redirect(`/admin/bookings/${req.params.id}`);
});

router.post('/bookings/:id/location-payment', async(req,res)=>{
  const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if(!booking) return res.status(404).render('errors/404',{title:'Not found'});
  if(booking.booking_status==='Cancelled' || booking.payment_method!=='Pay at Location'){
    req.session.flash={type:'danger',message:'This booking cannot receive a pay-at-location payment.'};
    return res.redirect(`/admin/bookings/${booking.id}`);
  }
  const amount=Number(req.body.amount);
  const balance=Math.max(0,Number(booking.total_amount)+Number(booking.late_penalty)-Number(booking.amount_paid));
  if(!Number.isFinite(amount) || amount<=0 || amount>balance+0.001){
    req.session.flash={type:'danger',message:'Enter an amount greater than zero and no more than the remaining balance.'};
    return res.redirect(`/admin/bookings/${booking.id}`);
  }
  const newPaid=Number(booking.amount_paid)+amount;
  const newStatus=newPaid>=Number(booking.total_amount)+Number(booking.late_penalty)-0.001?'Paid':'Partially Paid';
  db.transaction(()=>{
    db.prepare(`INSERT INTO payments (booking_id,user_id,amount,method,status,reference_no,verified_by,verified_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(booking.id,booking.user_id,amount,'Pay at Location','Verified',null,req.session.user.id);
    db.prepare('UPDATE bookings SET amount_paid=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newPaid,newStatus,booking.id);
  })();
  await notify(booking.user_id,'Payment received',`Your payment of ₱${amount.toFixed(2)} for ${booking.booking_code} was recorded at the shop.`);
  req.session.flash={type:'success',message:'Pay-at-location payment recorded.'};
  res.redirect(`/admin/bookings/${booking.id}`);
});

router.post('/payments/:id/verify', async(req,res)=>{
  const result=db.transaction(()=>{
    const payment=db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
    if(!payment) return {error:'Payment not found.'};
    if(payment.status!=='Pending Verification') return {error:'This payment has already been reviewed.'};
    const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(payment.booking_id);
    if(!booking || booking.booking_status==='Cancelled') return {error:'This booking cannot receive payment.'};
    const balance=Math.max(0,Number(booking.total_amount)+Number(booking.late_penalty)-Number(booking.amount_paid));
    if(Number(payment.amount)<=0 || Number(payment.amount)>balance+0.001) return {error:'Payment amount exceeds the remaining balance. Review the amount manually.'};
    const newPaid=Number(booking.amount_paid)+Number(payment.amount);
    const newStatus=newPaid>=Number(booking.total_amount)+Number(booking.late_penalty)-0.001?'Paid':'Partially Paid';
    const changed=db.prepare("UPDATE payments SET status='Verified',verified_by=?,verified_at=CURRENT_TIMESTAMP WHERE id=? AND status='Pending Verification'").run(req.session.user.id,payment.id);
    if(!changed.changes) return {error:'This payment has already been reviewed.'};
    db.prepare('UPDATE bookings SET amount_paid=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newPaid,newStatus,booking.id);
    return {booking,payment};
  })();
  if(result.error){req.session.flash={type:'warning',message:result.error};return res.redirect(result.booking?`/admin/bookings/${result.booking.id}`:'/admin/bookings');}
  await notify(result.booking.user_id,'Payment verified',`Your payment of ₱${Number(result.payment.amount).toFixed(2)} for ${result.booking.booking_code} was verified.`);
  req.session.flash={type:'success',message:'Payment verified.'}; res.redirect(`/admin/bookings/${result.booking.id}`);
});router.post('/payments/:id/reject',async(req,res)=>{
  const p=db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id); if(!p)return res.redirect('/admin/bookings');
  const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(p.booking_id);
  db.prepare("UPDATE payments SET status='Rejected',verified_by=?,verified_at=CURRENT_TIMESTAMP WHERE id=?").run(req.session.user.id,p.id);
  db.prepare("UPDATE bookings SET payment_status='Rejected' WHERE id=?").run(b.id);
  await notify(b.user_id,'Payment proof rejected',`The payment proof for ${b.booking_code} was rejected. Please submit a new proof.`);
  req.session.flash={type:'warning',message:'Payment rejected.'}; res.redirect(`/admin/bookings/${b.id}`);
});
router.post('/bookings/:id/refund',async(req,res)=>{
  const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if(b){db.prepare("UPDATE bookings SET refund_status='Refunded',payment_status='Refunded',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(b.id);await notify(b.user_id,'Refund completed',`Refund for ${b.booking_code} was marked completed.`);}
  req.session.flash={type:'success',message:'Refund marked completed.'};res.redirect(`/admin/bookings/${req.params.id}`);
});

router.post('/bookings/:id/damage',damageUpload,async(req,res)=>{
  const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id); if(!b)return res.redirect('/admin/bookings');
  const amount=Number(req.body.amount||0); if(amount<=0){req.session.flash={type:'danger',message:'Enter a valid damage charge.'};return res.redirect(`/admin/bookings/${b.id}`);}
  db.prepare('INSERT INTO damage_charges (booking_id,description,amount,photo_path,remarks) VALUES (?,?,?,?,?)').run(b.id,req.body.description,amount,req.file?`/uploads/damage/${req.file.filename}`:null,req.body.remarks||'');
  await notify(b.user_id,'Damage charge added',`A damage charge of ₱${amount.toFixed(2)} was added to ${b.booking_code}.`);
  req.session.flash={type:'success',message:'Damage charge added.'};res.redirect(`/admin/bookings/${b.id}`);
});

router.get('/customers',(req,res)=>{const customers=db.prepare("SELECT u.*,COUNT(b.id) booking_count FROM users u LEFT JOIN bookings b ON b.user_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY u.id DESC").all();res.render('admin/customers',{title:'Customer Management',customers});});
router.post('/customers/:id/toggle',(req,res)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(u)db.prepare('UPDATE users SET is_active=? WHERE id=?').run(u.is_active?0:1,u.id);req.session.flash={type:'success',message:'Customer status updated.'};res.redirect('/admin/customers');});

router.get('/maintenance',(req,res)=>{const rows=db.prepare(`SELECT m.*,v.brand,v.model,v.plate_number FROM maintenance m JOIN vehicles v ON v.id=m.vehicle_id ORDER BY m.id DESC`).all();const vehicles=db.prepare("SELECT * FROM vehicles WHERE status!='Archived' ORDER BY brand,model").all();res.render('admin/maintenance',{title:'Maintenance',rows,vehicles});});
router.post('/maintenance',(req,res)=>{const r=req.body;const result=db.prepare('INSERT INTO maintenance (vehicle_id,maintenance_type,description,start_date,end_date,cost,status,notes) VALUES (?,?,?,?,?,?,?,?)').run(r.vehicle_id,r.maintenance_type,r.description,r.start_date,r.end_date||null,Number(r.cost)||0,r.status||'Scheduled',r.notes||'');if(['Scheduled','In Progress'].includes(r.status||'Scheduled'))db.prepare("UPDATE vehicles SET status='Maintenance' WHERE id=?").run(r.vehicle_id);req.session.flash={type:'success',message:'Maintenance record added.'};res.redirect('/admin/maintenance');});
router.post('/maintenance/:id/complete',(req,res)=>{const m=db.prepare('SELECT * FROM maintenance WHERE id=?').get(req.params.id);if(m){db.prepare("UPDATE maintenance SET status='Completed',end_date=COALESCE(end_date,date('now')) WHERE id=?").run(m.id);db.prepare("UPDATE vehicles SET status='Available' WHERE id=? AND status='Maintenance'").run(m.vehicle_id);}req.session.flash={type:'success',message:'Maintenance completed.'};res.redirect('/admin/maintenance');});
router.post('/maintenance/:id/delete',(req,res)=>{db.prepare('DELETE FROM maintenance WHERE id=?').run(req.params.id);req.session.flash={type:'success',message:'Maintenance record deleted.'};res.redirect('/admin/maintenance');});

router.get('/reports',(req,res)=>{
  const from=req.query.from||'';const to=req.query.to||'';let where='1=1',args=[];if(from){where+=' AND date(b.created_at)>=date(?)';args.push(from);}if(to){where+=' AND date(b.created_at)<=date(?)';args.push(to);}
  const summary=db.prepare(`SELECT COUNT(*) bookings,COALESCE(SUM(b.total_amount),0) booked_value,COALESCE(SUM(b.amount_paid),0) collected,COALESCE(SUM(b.late_penalty),0) late_fees FROM bookings b WHERE ${where}`).get(...args);
  const rows=db.prepare(`SELECT b.*,u.first_name,u.last_name,v.brand,v.model FROM bookings b JOIN users u ON u.id=b.user_id JOIN vehicles v ON v.id=b.vehicle_id WHERE ${where} ORDER BY b.created_at DESC`).all(...args);
  const popular=db.prepare(`SELECT v.brand||' '||v.model vehicle,COUNT(b.id) rentals FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.booking_status!='Cancelled' GROUP BY v.id ORDER BY rentals DESC LIMIT 5`).all();
  const maint=db.prepare("SELECT COALESCE(SUM(cost),0) total FROM maintenance WHERE status='Completed'").get().total;
  res.render('admin/reports',{title:'Reports',summary,rows,popular,maint,from,to});
});

router.get('/notifications',(req,res)=>{const items=db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC').all(req.session.user.id);db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.session.user.id);res.render('customer/notifications',{title:'Admin Notifications',items});});

module.exports = router;
