const db=require('../db/database');
function validRegistration(v,endDate){return v.type!=='Motorcycle'||!!(v.or_path&&v.cr_path&&v.registration_expiry&&v.registration_expiry>=endDate);}
function checkReminders(){
 const vehicles=db.prepare("SELECT * FROM vehicles WHERE status!='Archived' AND registration_expiry IS NOT NULL AND date(registration_expiry)<=date('now','+1 month')").all();
 const admins=db.prepare("SELECT id FROM users WHERE role='admin' AND is_active=1").all();
 db.transaction(()=>{for(const v of vehicles)for(const u of admins){
 const result=db.prepare('INSERT OR IGNORE INTO document_reminders(vehicle_id,expiry,user_id) VALUES(?,?,?)').run(v.id,v.registration_expiry,u.id);
 if(result.changes) db.prepare('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)').run(u.id,'Vehicle registration renewal',`${v.brand} ${v.model} (${v.plate_number}): registration expires on ${v.registration_expiry}. Upload the renewed OR and CR and update the expiry date.`);
 }})();
}
module.exports={validRegistration,checkReminders};
