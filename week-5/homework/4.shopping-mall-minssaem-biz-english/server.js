require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET 환경변수가 필요합니다.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '30d';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.irfvftnlvbyfuagajrmg',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// 강의 콘텐츠(제목/커리큘럼/가격 등)는 프론트엔드 COURSES 배열이 원본이다.
// DB는 "이 유저가 어떤 course_id 를 장바구니/수강중에 담았는지"만 저장한다.
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS minssaem_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS minssaem_cart (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES minssaem_users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, course_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS minssaem_enrollments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES minssaem_users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, course_id)
    )
  `);
}

// ── 인증 헬퍼 ─────────────────────────────────────────

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function getAuthUser(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    return { id: payload.sub, username: payload.username };
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.authUser = authUser;
  next();
}

function publicUser(row) {
  return { id: row.id, username: row.username, nickname: row.nickname };
}

// ── 회원가입 / 로그인 / 내 정보 ───────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const nickname = (req.body.nickname || '').trim() || username;
  if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호가 필요합니다.' });
  if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO minssaem_users (username, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, username, nickname',
      [username, passwordHash, nickname]
    );
    const user = rows[0];
    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '이미 존재하는 아이디입니다.' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  try {
    const { rows } = await pool.query('SELECT * FROM minssaem_users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM minssaem_users WHERE id = $1', [req.authUser.id]);
    if (!rows[0]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(publicUser(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 장바구니 API (로그인 필요) — course_id 문자열 배열로 주고받는다 ──

async function fetchIds(table, userId) {
  const { rows } = await pool.query(
    `SELECT course_id FROM ${table} WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  return rows.map((r) => r.course_id);
}

app.get('/api/cart', requireAuth, async (req, res) => {
  try {
    res.json(await fetchIds('minssaem_cart', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cart', requireAuth, async (req, res) => {
  const courseId = (req.body.course_id || '').trim();
  if (!courseId) return res.status(400).json({ error: '강의가 필요합니다.' });
  try {
    await pool.query(
      'INSERT INTO minssaem_cart (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING',
      [req.authUser.id, courseId]
    );
    res.status(201).json(await fetchIds('minssaem_cart', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cart/:courseId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM minssaem_cart WHERE user_id = $1 AND course_id = $2',
      [req.authUser.id, req.params.courseId]
    );
    res.json(await fetchIds('minssaem_cart', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cart', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM minssaem_cart WHERE user_id = $1', [req.authUser.id]);
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 모의 결제 (실제 결제 없음) — 장바구니 전체를 수강중으로 전환 ──

app.post('/api/checkout', requireAuth, async (req, res) => {
  try {
    const cartIds = await fetchIds('minssaem_cart', req.authUser.id);
    if (cartIds.length === 0) return res.status(400).json({ error: '장바구니가 비어 있습니다.' });
    for (const courseId of cartIds) {
      await pool.query(
        'INSERT INTO minssaem_enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING',
        [req.authUser.id, courseId]
      );
    }
    await pool.query('DELETE FROM minssaem_cart WHERE user_id = $1', [req.authUser.id]);
    res.json({ purchased: cartIds, myCourses: await fetchIds('minssaem_enrollments', req.authUser.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/my-courses', requireAuth, async (req, res) => {
  try {
    res.json(await fetchIds('minssaem_enrollments', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
