function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    req.session.flash = { type: 'warning', message: 'Please sign in to continue.' };
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('errors/403', { title: 'Access denied' });
  }
  next();
}

function requireCustomer(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'customer') {
    return res.status(403).render('errors/403', { title: 'Access denied' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireCustomer };
