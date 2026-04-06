require('dotenv').config();
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sixtyone';

const db = new Database('./tournament.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, points INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS prizes (rank INTEGER PRIMARY KEY, label TEXT, value TEXT);
  CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY AUTOINCREMENT, round TEXT, team1 TEXT, team2 TEXT, score1 INTEGER DEFAULT 0, score2 INTEGER DEFAULT 0, done INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, image_url TEXT, sort_order INTEGER DEFAULT 0, visible INTEGER DEFAULT 1);
`);

const defaults = {
  tournament_name:'Rocket League Tournament', server_name:'SixtyOne',
  start_time: new Date(Date.now()+2*3600*1000).toISOString(), max_teams:'8',
  color_bg:'#000000', color_primary:'#c084fc', color_secondary:'#e879f9',
  color_accent:'#f97316', color_text:'#ffffff', color_card_bg:'#0d0220',
  color_timer:'#e879f9', color_wave1:'#1e0550', color_wave2:'#4c1d95',
  font_family:'Arial', font_size_title:'62', font_size_body:'14',
  font_weight_title:'900', title_color:'#ffffff', subtitle_color:'#c084fc',
  bg_type:'wave', bg_image_url:'', bg_opacity:'1', wave_speed:'4',
  hero_title:'SixtyOne', hero_script_text:'SixtyOne', hero_server_text:'server',
  timer_label:'تبدأ البطولة بعد', timer_color:'#e879f9', show_timer:'1',
  tab_prizes_label:'الجوائز', tab_bracket_label:'الأدوار',
  tab_standings_label:'الترتيب', tab_info_label:'معلومات',
};
for (const [k,v] of Object.entries(defaults)) {
  if (!db.prepare('SELECT value FROM settings WHERE key=?').get(k))
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(k,v);
}

const defPrizes = [{rank:1,label:'المركز الأول',value:'20$'},{rank:2,label:'المركز الثاني',value:'10$'},{rank:3,label:'المركز الثالث',value:'بكج VIP'}];
for (const p of defPrizes) {
  if (!db.prepare('SELECT * FROM prizes WHERE rank=?').get(p.rank))
    db.prepare('INSERT INTO prizes(rank,label,value) VALUES(?,?,?)').run(p.rank,p.label,p.value);
}

app.use(express.json({limit:'20mb'}));
app.use(express.urlencoded({extended:true}));
app.set('trust proxy',1);
app.use(express.static(path.join(__dirname,'public')));
app.use(session({
  secret: process.env.SESSION_SECRET||'sixtyone_secret',
  resave:false, saveUninitialized:false,
  cookie:{secure:process.env.NODE_ENV==='production', maxAge:24*3600*1000}
}));

const isAdmin = req => req.session.admin===true;
const requireAdmin = (req,res,next) => { if(!isAdmin(req)) return res.status(403).json({error:'غير مصرح'}); next(); };

// Login
app.post('/api/login',(req,res)=>{
  const{password}=req.body;
  if(password===ADMIN_PASSWORD){
    req.session.admin=true;
    res.json({ok:true});
  } else {
    res.status(401).json({error:'كلمة السر خاطئة'});
  }
});

app.post('/api/logout',(req,res)=>{
  req.session.destroy();
  res.json({ok:true});
});

app.get('/api/me',(req,res)=>res.json({admin:isAdmin(req)}));

app.get('/api/public',(req,res)=>{
  const settings={};
  for(const r of db.prepare('SELECT key,value FROM settings').all()) settings[r.key]=r.value;
  res.json({
    settings,
    teams:db.prepare('SELECT * FROM teams ORDER BY points DESC,wins DESC').all(),
    prizes:db.prepare('SELECT * FROM prizes ORDER BY rank').all(),
    matches:db.prepare('SELECT * FROM matches ORDER BY id').all(),
    sections:db.prepare('SELECT * FROM sections WHERE visible=1 ORDER BY sort_order').all(),
  });
});

// Settings
app.post('/api/admin/settings',requireAdmin,(req,res)=>{
  for(const[k,v] of Object.entries(req.body))
    db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k,String(v));
  res.json({ok:true});
});

// Teams
app.post('/api/admin/teams',requireAdmin,(req,res)=>{
  const{name,wins,losses,points}=req.body;
  const info=db.prepare('INSERT INTO teams(name,wins,losses,points) VALUES(?,?,?,?)').run(name,wins||0,losses||0,points||0);
  res.json({id:info.lastInsertRowid});
});
app.put('/api/admin/teams/:id',requireAdmin,(req,res)=>{
  const{name,wins,losses,points}=req.body;
  db.prepare('UPDATE teams SET name=?,wins=?,losses=?,points=? WHERE id=?').run(name,wins,losses,points,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/teams/:id',requireAdmin,(req,res)=>{
  db.prepare('DELETE FROM teams WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Prizes
app.post('/api/admin/prizes',requireAdmin,(req,res)=>{
  const{rank,label,value}=req.body;
  db.prepare('INSERT OR REPLACE INTO prizes(rank,label,value) VALUES(?,?,?)').run(rank,label,value);
  res.json({ok:true});
});
app.delete('/api/admin/prizes/:rank',requireAdmin,(req,res)=>{
  db.prepare('DELETE FROM prizes WHERE rank=?').run(req.params.rank);
  res.json({ok:true});
});

// Matches
app.post('/api/admin/matches',requireAdmin,(req,res)=>{
  const{round,team1,team2,score1,score2,done}=req.body;
  const info=db.prepare('INSERT INTO matches(round,team1,team2,score1,score2,done) VALUES(?,?,?,?,?,?)').run(round,team1,team2,score1||0,score2||0,done?1:0);
  res.json({id:info.lastInsertRowid});
});
app.put('/api/admin/matches/:id',requireAdmin,(req,res)=>{
  const{round,team1,team2,score1,score2,done}=req.body;
  db.prepare('UPDATE matches SET round=?,team1=?,team2=?,score1=?,score2=?,done=? WHERE id=?').run(round,team1,team2,score1,score2,done?1:0,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/matches/:id',requireAdmin,(req,res)=>{
  db.prepare('DELETE FROM matches WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Sections
app.post('/api/admin/sections',requireAdmin,(req,res)=>{
  const{title,content,image_url,sort_order,visible}=req.body;
  const info=db.prepare('INSERT INTO sections(title,content,image_url,sort_order,visible) VALUES(?,?,?,?,?)').run(title,content,image_url||'',sort_order||0,visible!==undefined?visible:1);
  res.json({id:info.lastInsertRowid});
});
app.put('/api/admin/sections/:id',requireAdmin,(req,res)=>{
  const{title,content,image_url,sort_order,visible}=req.body;
  db.prepare('UPDATE sections SET title=?,content=?,image_url=?,sort_order=?,visible=? WHERE id=?').run(title,content,image_url||'',sort_order||0,visible!==undefined?visible:1,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/sections/:id',requireAdmin,(req,res)=>{
  db.prepare('DELETE FROM sections WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.listen(PORT,()=>console.log(`SixtyOne running on port ${PORT}`));
