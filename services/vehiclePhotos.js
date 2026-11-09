const catalog=require('../public/images/fleet/catalog.json');
function key(v){let model=v.model.toLowerCase();if(model.startsWith(v.brand.toLowerCase()+' '))model=model.slice(v.brand.length+1);const full=(v.brand+' '+model).toLowerCase();return Object.keys(catalog).find(k=>full===k.toLowerCase()||full.startsWith(k.toLowerCase()+' ')||full.startsWith(k.toLowerCase())&&/^\d/.test(full.slice(k.length)));}
function photos(v){const items=catalog[key(v)]||[];const custom=v.image&&!v.image.endsWith('.svg')&&!v.image.startsWith('/images/fleet/');return custom?[{src:v.image,title:v.brand+' '+v.model},...items].slice(0,5):items;}
function apply(){const db=require('../db/database');for(const v of db.prepare('SELECT * FROM vehicles').all()){const items=photos(v);if(items.length&&(!v.image||v.image.endsWith('.svg')||v.image.startsWith('/images/fleet/')))db.prepare('UPDATE vehicles SET image=? WHERE id=?').run(items[0].src,v.id);}}
module.exports={photos,apply};
