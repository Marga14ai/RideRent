const db=require('./database');
module.exports=function upgrade(){
 const columns=db.prepare('PRAGMA table_info(vehicles)').all();
 for(const name of ['or_path','cr_path','registration_expiry']) if(!columns.some(c=>c.name===name)) db.exec(`ALTER TABLE vehicles ADD COLUMN ${name} TEXT`);
 db.exec(`CREATE TABLE IF NOT EXISTS site_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS page_visits(id INTEGER PRIMARY KEY,visitor_key TEXT NOT NULL,path TEXT NOT NULL,visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS visits_date ON page_visits(visited_at);
 CREATE TABLE IF NOT EXISTS document_reminders(vehicle_id INTEGER NOT NULL,expiry TEXT NOT NULL,user_id INTEGER NOT NULL,PRIMARY KEY(vehicle_id,expiry,user_id),FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS review_reactions(review_id INTEGER NOT NULL,user_id INTEGER NOT NULL,reaction TEXT NOT NULL CHECK(reaction IN ('like','love')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(review_id,user_id),FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);`);
 db.exec(`CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY,sess TEXT NOT NULL,expire INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS sessions_expire ON sessions(expire);`);
 db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now());
};
