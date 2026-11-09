const db = require('../db/database');
const config = require('../config/appConfig');
const { expireStaleReservations } = require('../utils/rental');
const crypto = require('crypto');

module.exports = function globals(req, res, next) {
  try { expireStaleReservations(); } catch (e) { console.error(e); }
  res.locals.vehiclePhotos=require('../services/vehiclePhotos').photos;
  req.session.csrfToken ||= crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken=req.session.csrfToken;
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  const settings=Object.fromEntries(db.prepare('SELECT key,value FROM site_settings').all().map(r=>[r.key,r.value]));
  res.locals.config = {...config,...settings};
  res.locals.visitCount=db.prepare('SELECT COUNT(DISTINCT visitor_key) c FROM page_visits').get().c;
  if(req.method==='GET' && (['/','/about','/contact','/vehicles'].includes(req.path)||/^\/vehicles\/\d+$/.test(req.path))){
    req.session.visitorKey ||= require('crypto').randomUUID();
    db.prepare('INSERT INTO page_visits(visitor_key,path) VALUES(?,?)').run(req.session.visitorKey,req.path);
    res.locals.visitCount=db.prepare('SELECT COUNT(DISTINCT visitor_key) c FROM page_visits').get().c;
  }
  res.locals.path = req.path;
  res.locals.notificationCount = 0;
  if (req.session.user) {
    res.locals.notificationCount = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND is_read=0').get(req.session.user.id).c;
  }
  next();
};
