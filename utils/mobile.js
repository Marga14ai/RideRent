function normalizeMobile(value){let n=String(value||'').replace(/[\s()+-]/g,''); if(n.startsWith('63'))n='0'+n.slice(2); return /^09\d{9}$/.test(n)?n:null;}
function mobileOwner(db,value,exclude=0){const n=normalizeMobile(value);return n&&db.prepare('SELECT id,contact FROM users WHERE id!=?').all(exclude).find(u=>normalizeMobile(u.contact)===n);}
module.exports={normalizeMobile,mobileOwner};
