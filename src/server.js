require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database ───────────────────────────────────────────────
const db = new Database('./tournament.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    discord_id TEXT
  );

  CREATE TABLE IF NOT EXISTS prizes (
    rank INTEGER PRIMARY KEY,
    label TEXT,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round TEXT,
    team1 TEXT,
    team2 TEXT,
    score1 INTEGER DEFAULT 0,
    score2 INTEGER DEFAULT 0,
    done INTEGER DEFAULT 0
  );
`);

// Default settings
const defaults = {
  tournament_name: 'Rocket League Tournament',
  server_name: 'SixtyOne Server',
  start_time: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  max_teams: '8',
};
for (const [k, v] of Object.entries(defaults)) {
  const existing = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  if (!existing) db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(k, v);
}

// Default prizes
const defaultPrizes = [
  { rank: 1, label: 'المركز الأول', value: '20$' },
  { rank: 2, label: 'المركز الثاني', value: '10$' },
  { rank: 3, label: 'المركز الثالث', value: 'بكج VIP' },
];
for (const p of defaultPrizes) {
  const ex = db.prepare('SELECT * FROM prizes WHERE rank=?').get(p.rank);
  if (!ex) db.prepare('INSERT INTO prizes(rank,label,value) VALUES(?,?,?)').run(p.rank, p.label, p.value);
}

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 3600 * 1000 }
}));

// ─── Helpers ─────────────────────────────────────────────────
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, String(value));
}
function isAdmin(req) {
  if (!req.session.user) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(req.session.user.discord_id);
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'ليس لديك صلاحية' });
  next();
}

// ─── Discord OAuth ───────────────────────────────────────────
app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });
    const u = userRes.data;
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim());
    const isAdminUser = adminIds.includes(u.id) ? 1 : 0;
    db.prepare(`INSERT OR REPLACE INTO users(discord_id,username,avatar,is_admin) VALUES(?,?,?,?)`).run(u.id, u.username, u.avatar, isAdminUser);
    req.session.user = { discord_id: u.id, username: u.username, avatar: u.avatar, is_admin: isAdminUser };
    res.redirect('/');
  } catch (e) {
    console.error(e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ─── Public API ──────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  res.json(req.session.user || null);
});

app.get('/api/public', (req, res) => {
  const settings = {};
  for (const row of db.prepare('SELECT key,value FROM settings').all()) settings[row.key] = row.value;
  const teams = db.prepare('SELECT * FROM teams ORDER BY points DESC, wins DESC').all();
  const prizes = db.prepare('SELECT * FROM prizes ORDER BY rank').all();
  const matches = db.prepare('SELECT * FROM matches ORDER BY id').all();
  res.json({ settings, teams, prizes, matches });
});

// ─── Admin API ───────────────────────────────────────────────
// Settings
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { tournament_name, server_name, start_time, max_teams } = req.body;
  if (tournament_name) setSetting('tournament_name', tournament_name);
  if (server_name) setSetting('server_name', server_name);
  if (start_time) setSetting('start_time', start_time);
  if (max_teams) setSetting('max_teams', max_teams);
  res.json({ ok: true });
});

// Teams
app.get('/api/admin/teams', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM teams ORDER BY points DESC').all());
});
app.post('/api/admin/teams', requireAdmin, (req, res) => {
  const { name, wins, losses, points, discord_id } = req.body;
  const info = db.prepare('INSERT INTO teams(name,wins,losses,points,discord_id) VALUES(?,?,?,?,?)').run(name, wins || 0, losses || 0, points || 0, discord_id || null);
  // Update max_teams if needed
  const count = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;
  const current = parseInt(getSetting('max_teams') || 8);
  if (count > current) setSetting('max_teams', count);
  res.json({ id: info.lastInsertRowid });
});
app.put('/api/admin/teams/:id', requireAdmin, (req, res) => {
  const { name, wins, losses, points } = req.body;
  db.prepare('UPDATE teams SET name=?,wins=?,losses=?,points=? WHERE id=?').run(name, wins, losses, points, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/teams/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM teams WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Prizes
app.post('/api/admin/prizes', requireAdmin, (req, res) => {
  const { rank, label, value } = req.body;
  db.prepare('INSERT OR REPLACE INTO prizes(rank,label,value) VALUES(?,?,?)').run(rank, label, value);
  res.json({ ok: true });
});
app.delete('/api/admin/prizes/:rank', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM prizes WHERE rank=?').run(req.params.rank);
  res.json({ ok: true });
});

// Matches
app.post('/api/admin/matches', requireAdmin, (req, res) => {
  const { round, team1, team2, score1, score2, done } = req.body;
  const info = db.prepare('INSERT INTO matches(round,team1,team2,score1,score2,done) VALUES(?,?,?,?,?,?)').run(round, team1, team2, score1 || 0, score2 || 0, done ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});
app.put('/api/admin/matches/:id', requireAdmin, (req, res) => {
  const { round, team1, team2, score1, score2, done } = req.body;
  db.prepare('UPDATE matches SET round=?,team1=?,team2=?,score1=?,score2=?,done=? WHERE id=?').run(round, team1, team2, score1, score2, done ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/matches/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM matches WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => console.log(`SixtyOne Tournament running on port ${PORT}`));
