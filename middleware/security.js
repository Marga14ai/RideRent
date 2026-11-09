module.exports = function security(req, res, next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const site = req.get('sec-fetch-site');
  if (site && !['same-origin','none'].includes(site)) {
    return res.status(403).render('errors/message', { title: 'Request blocked', message: 'Reload the page and try again.' });
  }
  const origin = req.get('origin');
  const referer = req.get('referer');
  let source = origin;
  try { if (!source && referer) source = new URL(referer).origin; }
  catch { return res.status(403).render('errors/message', { title: 'Request blocked', message: 'Reload the page and try again.' }); }
  if (source && source !== `${req.protocol}://${req.get('host')}`) {
    return res.status(403).render('errors/message', { title: 'Request blocked', message: 'Reload the page and try again.' });
  }
  const multipart = req.is('multipart/form-data');
  if (multipart && !source && site !== 'same-origin') {
    return res.status(403).render('errors/message', { title: 'Request blocked', message: 'Reload the page and try again.' });
  }
  if (!multipart && (!req.session.csrfToken || req.body?._csrf !== req.session.csrfToken)) {
    return res.status(403).render('errors/message', { title: 'Request blocked', message: 'Your form expired. Reload the page and try again.' });
  }
  next();
};
