const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/', (req, res) => {
  const featured = db.prepare(`SELECT v.*, COALESCE(AVG(r.rating),0) avg_rating, COUNT(r.id) review_count
    FROM vehicles v LEFT JOIN reviews r ON r.vehicle_id=v.id
    WHERE v.status!='Archived' GROUP BY v.id ORDER BY v.id LIMIT 8`).all();
  res.render('home', { title: 'Home', featured });
});

router.get('/vehicles', (req, res) => {
  const { type, transmission, q, sort } = req.query;
  let sql = `SELECT v.*, COALESCE(AVG(r.rating),0) avg_rating, COUNT(r.id) review_count
             FROM vehicles v LEFT JOIN reviews r ON r.vehicle_id=v.id WHERE v.status!='Archived'`;
  const params = [];
  if (type) { sql += ' AND v.type=?'; params.push(type); }
  if (transmission) { sql += ' AND v.transmission=?'; params.push(transmission); }
  if (q) { sql += ' AND (v.brand LIKE ? OR v.model LIKE ? OR v.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' GROUP BY v.id';
  if (sort === 'price_asc') sql += ' ORDER BY v.daily_rate ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY v.daily_rate DESC';
  else if (sort === 'rating') sql += ' ORDER BY avg_rating DESC';
  else sql += ' ORDER BY v.id DESC';
  const vehicles = db.prepare(sql).all(...params);
  res.render('vehicles/list', { title: 'Vehicles', vehicles, filters: req.query });
});

router.get('/vehicles/:id', (req, res) => {
  const vehicle = db.prepare(`SELECT v.*, COALESCE(AVG(r.rating),0) avg_rating, COUNT(r.id) review_count
    FROM vehicles v LEFT JOIN reviews r ON r.vehicle_id=v.id WHERE v.id=? GROUP BY v.id`).get(req.params.id);
  if (!vehicle) return res.status(404).render('errors/404', { title: 'Not found' });
  const reviews = db.prepare(`SELECT r.*, u.first_name,u.last_name,
    (SELECT COUNT(*) FROM review_reactions x WHERE x.review_id=r.id AND x.reaction='like') like_count,
    (SELECT COUNT(*) FROM review_reactions x WHERE x.review_id=r.id AND x.reaction='love') love_count,
    (SELECT reaction FROM review_reactions x WHERE x.review_id=r.id AND x.user_id=?) my_reaction
    FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.vehicle_id=? ORDER BY r.id DESC`).all(req.session.user?.id || 0,vehicle.id);
  const shareBase = `${(process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/,'')}/vehicles/${vehicle.id}`;
  const shareReview = req.query.review ? db.prepare('SELECT r.id,r.rating,r.comment,v.brand,v.model FROM reviews r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=? AND r.vehicle_id=?').get(req.query.review,vehicle.id) : null;
  res.render('vehicles/detail', { title: `${vehicle.brand} ${vehicle.model}`, vehicle, reviews, shareBase, shareReview });
});

router.get('/about', (req, res) => res.render('about', { title: 'About' }));
router.get('/contact', (req, res) => res.render('contact', { title: 'Contact' }));

module.exports = router;
