const router=require('express').Router(),db=require('../db/database');
router.get('/settings',(req,res)=>res.render('admin/settings',{title:'Shop settings'}));
router.post('/settings',(req,res)=>{
 const r=req.body,lat=Number(r.latitude),lng=Number(r.longitude);
 if(!r.siteName?.trim()||!r.location?.trim()||!r.latitude||!r.longitude||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){req.session.flash={type:'danger',message:'Enter the shop name, address, and valid map coordinates.'};return res.redirect('/admin/settings');}
 db.transaction(()=>{for(const key of ['siteName','location','contactEmail','contactNumber','openingHours','latitude','longitude'])db.prepare('INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(r[key]||'').trim());})();
 req.session.flash={type:'success',message:'Shop settings saved.'};res.redirect('/admin/settings');
});
router.get('/visitors',(req,res)=>res.render('admin/visitors',{title:'Visitor statistics',stats:db.prepare("SELECT COUNT(*) views,COUNT(DISTINCT visitor_key) visitors,SUM(date(visited_at)=date('now')) today FROM page_visits").get(),pages:db.prepare('SELECT path,COUNT(*) views,COUNT(DISTINCT visitor_key) visitors FROM page_visits GROUP BY path ORDER BY views DESC').all()}));
router.get('/documents',(req,res)=>res.render('admin/documents',{title:'Registration documents',vehicles:db.prepare("SELECT * FROM vehicles WHERE type='Motorcycle' AND status!='Archived' ORDER BY registration_expiry").all()}));
router.get('/database',(req,res)=>{
 const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(t=>({...t,columns:db.prepare(`PRAGMA table_info("${t.name}")`).all(),foreignKeys:db.prepare(`PRAGMA foreign_key_list("${t.name}")`).all(),count:db.prepare(`SELECT COUNT(*) count FROM "${t.name}"`).get().count}));
 const selected=tables.find(t=>t.name===req.query.table);let rows=[],page=Math.max(1,parseInt(req.query.page)||1);
 if(selected){page=Math.min(page,Math.max(1,Math.ceil(selected.count/50)));rows=db.prepare(`SELECT * FROM "${selected.name}" LIMIT 50 OFFSET ?`).all((page-1)*50).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,/password|token|visitor_key|valid_id|license_path|proof_path|or_path|cr_path/i.test(k)?'[protected]':v])));}
 res.render('admin/database',{title:'Database explorer',tables,selected,rows,page});
});
module.exports=router;
