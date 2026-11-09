require('dotenv').config();
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be set in production.');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');
const initDb = require('./db/init');
const globals = require('./middleware/globals');
const security = require('./middleware/security');

initDb();
require('./db/upgrade')();
require('./services/vehiclePhotos').apply();
const {checkReminders}=require('./services/registrationService');
checkReminders();
setInterval(checkReminders,60*60*1000).unref();
const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));
app.use(session({secret:process.env.SESSION_SECRET||'riderent-demo-secret',resave:false,saveUninitialized:false,store:new (require('./services/sqliteSessionStore'))(),cookie:{maxAge:1000*60*60*8,httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}}));
app.use(globals);
app.use(security);

app.use('/', require('./routes/public'));
app.use('/', require('./routes/auth'));
app.use('/customer', require('./routes/customer'));
app.use('/admin', require('./routes/admin'));

app.use((req,res)=>res.status(404).render('errors/404',{title:'Page not found'}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).render('errors/message',{title:'Something went wrong',message:err.message||'Unexpected server error.'});});

const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`RideRent running at http://localhost:${port}`));
