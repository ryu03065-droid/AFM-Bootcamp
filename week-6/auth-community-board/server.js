require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const ImageKit = require('imagekit');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET 환경변수가 필요합니다.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '7d';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let imagekit = null;
if (process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
} else {
  console.warn('ImageKit 환경변수가 설정되지 않아 프로필 이미지 업로드가 비활성화됩니다.');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('이미지 파일만 업로드할 수 있어요.'));
    cb(null, true);
  },
});

const pool = new Pool({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.irfvftnlvbyfuagajrmg',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

const CATEGORIES = ['맛집', '레시피', '자유'];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_app_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE community_app_users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_app_posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES community_app_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '자유',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE community_app_posts ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_app_likes (
      post_id INTEGER NOT NULL REFERENCES community_app_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES community_app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id)
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
  return { id: row.id, username: row.username, nickname: row.nickname, bio: row.bio, avatar_url: row.avatar_url || null };
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
      'INSERT INTO community_app_users (username, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, username, nickname, bio',
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
    const { rows } = await pool.query('SELECT * FROM community_app_users WHERE username = $1', [username]);
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
    const { rows } = await pool.query('SELECT * FROM community_app_users WHERE id = $1', [req.authUser.id]);
    if (!rows[0]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(publicUser(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const nickname = (req.body.nickname || '').trim();
  const bio = (req.body.bio ?? '').toString();
  if (!nickname) return res.status(400).json({ error: '닉네임을 입력하세요.' });
  try {
    const { rows } = await pool.query(
      'UPDATE community_app_users SET nickname = $1, bio = $2 WHERE id = $3 RETURNING id, username, nickname, bio, avatar_url',
      [nickname, bio, req.authUser.id]
    );
    res.json(publicUser(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/profile/avatar', requireAuth, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    if (!imagekit) return res.status(503).json({ error: '이미지 업로드가 설정되어 있지 않습니다.' });
    try {
      const uploaded = await imagekit.upload({
        file: req.file.buffer,
        fileName: `avatar_${req.authUser.id}_${Date.now()}`,
        folder: '/community-app/avatars',
        useUniqueFileName: true,
      });
      const { rows } = await pool.query(
        'UPDATE community_app_users SET avatar_url = $1 WHERE id = $2 RETURNING id, username, nickname, bio, avatar_url',
        [uploaded.url, req.authUser.id]
      );
      res.json(publicUser(rows[0]));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// ── 공개 프로필 조회 ──────────────────────────────────

app.get('/api/users/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM community_app_users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    const { rows: statRows } = await pool.query(
      `SELECT
        COUNT(DISTINCT p.id)::int AS post_count,
        COUNT(l.post_id)::int AS like_count
      FROM community_app_users u
      LEFT JOIN community_app_posts p ON p.user_id = u.id
      LEFT JOIN community_app_likes l ON l.post_id = p.id
      WHERE u.id = $1`,
      [req.params.id]
    );
    res.json({ ...publicUser(rows[0]), ...statRows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 게시글 API ────────────────────────────────────────

app.get('/api/posts', async (req, res) => {
  const sort = req.query.sort === 'likes' ? 'like_count DESC, p.created_at DESC' : 'p.created_at DESC';
  const me = getAuthUser(req);
  const params = [];
  let where = '';
  if (me) { params.push(me.id); }
  if (req.query.userId) {
    params.push(req.query.userId);
    where = `WHERE p.user_id = $${params.length}`;
  }
  try {
    const { rows } = await pool.query(
      `
      SELECT
        p.id, p.title, p.content, p.category, p.created_at, p.updated_at,
        p.user_id,
        u.nickname AS author_nickname,
        u.avatar_url AS author_avatar,
        COALESCE(l.like_count, 0)::int AS like_count,
        ${me ? 'EXISTS(SELECT 1 FROM community_app_likes ml WHERE ml.post_id = p.id AND ml.user_id = $1)' : 'false'} AS liked_by_me
      FROM community_app_posts p
      JOIN community_app_users u ON u.id = p.user_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS like_count FROM community_app_likes GROUP BY post_id
      ) l ON l.post_id = p.id
      ${where}
      ORDER BY ${sort}
      `,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const title = (req.body.title || '').trim();
  const content = (req.body.content || '').trim();
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : '자유';
  if (!title) return res.status(400).json({ error: '제목을 입력하세요.' });
  if (!content) return res.status(400).json({ error: '내용을 입력하세요.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO community_app_posts (user_id, title, content, category)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, content, category, created_at, updated_at, user_id`,
      [req.authUser.id, title, content, category]
    );
    const { rows: userRows } = await pool.query('SELECT nickname FROM community_app_users WHERE id = $1', [req.authUser.id]);
    res.status(201).json({ ...rows[0], author_nickname: userRows[0].nickname, like_count: 0, liked_by_me: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/posts/:id', requireAuth, async (req, res) => {
  const title = (req.body.title || '').trim();
  const content = (req.body.content || '').trim();
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : '자유';
  if (!title) return res.status(400).json({ error: '제목을 입력하세요.' });
  if (!content) return res.status(400).json({ error: '내용을 입력하세요.' });
  try {
    const { rows } = await pool.query(
      `UPDATE community_app_posts SET title = $1, content = $2, category = $3, updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING id, title, content, category, created_at, updated_at, user_id`,
      [title, content, category, req.params.id, req.authUser.id]
    );
    if (rows.length === 0) return res.status(403).json({ error: '수정 권한이 없습니다.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM community_app_posts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.authUser.id]
    );
    if (rows.length === 0) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    res.json({ message: '삭제 완료' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  const postId = req.params.id;
  try {
    const { rows: existing } = await pool.query(
      'SELECT 1 FROM community_app_likes WHERE post_id = $1 AND user_id = $2',
      [postId, req.authUser.id]
    );
    if (existing.length > 0) {
      await pool.query('DELETE FROM community_app_likes WHERE post_id = $1 AND user_id = $2', [postId, req.authUser.id]);
    } else {
      await pool.query('INSERT INTO community_app_likes (post_id, user_id) VALUES ($1, $2)', [postId, req.authUser.id]);
    }
    const { rows } = await pool.query('SELECT COUNT(*)::int AS like_count FROM community_app_likes WHERE post_id = $1', [postId]);
    res.json({ id: Number(postId), like_count: rows[0].like_count, liked_by_me: existing.length === 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
