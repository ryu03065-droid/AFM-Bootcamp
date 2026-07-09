require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

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

const CATEGORIES = ['고민', '칭찬', '응원'];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_posts (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '고민',
      likes INTEGER NOT NULL DEFAULT 0,
      owner_token TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// ── 게시글 API ────────────────────────────────────────

app.get('/api/posts', async (req, res) => {
  const sort = req.query.sort === 'likes' ? 'likes DESC, created_at DESC' : 'created_at DESC';
  try {
    const { rows } = await pool.query(
      `SELECT id, content, category, likes, created_at FROM board_posts ORDER BY ${sort}`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts', async (req, res) => {
  const { content, category } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력하세요.' });
  const safeCategory = CATEGORIES.includes(category) ? category : '고민';
  const ownerToken = crypto.randomUUID();
  try {
    const { rows } = await pool.query(
      'INSERT INTO board_posts (content, category, owner_token) VALUES ($1, $2, $3) RETURNING id, content, category, likes, created_at',
      [content.trim(), safeCategory, ownerToken]
    );
    res.status(201).json({ ...rows[0], owner_token: ownerToken });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE board_posts SET likes = likes + 1 WHERE id = $1 RETURNING id, content, category, likes, created_at',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/posts/:id', async (req, res) => {
  const { owner_token } = req.body;
  if (!owner_token) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
  try {
    const { rows } = await pool.query(
      'DELETE FROM board_posts WHERE id = $1 AND owner_token = $2 RETURNING id',
      [req.params.id, owner_token]
    );
    if (rows.length === 0) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    res.json({ message: '삭제 완료' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
