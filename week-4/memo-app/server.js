require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

app.get('/api/memos', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, content, created_at, updated_at FROM memos ORDER BY updated_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/memos', async (req, res) => {
  const { title = '', content = '' } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO memos (title, content) VALUES ($1, $2) RETURNING id, title, content, created_at, updated_at',
      [title, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/memos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, content } = req.body;
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE memos SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        updated_at = NOW()
       WHERE id = $3
       RETURNING id, title, content, created_at, updated_at`,
      [title ?? null, content ?? null, id]
    );
    if (rowCount === 0) return res.status(404).json({ success: false, message: '메모를 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/memos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rowCount } = await pool.query('DELETE FROM memos WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ success: false, message: '메모를 찾을 수 없습니다' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

init()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('DB 연결 실패:', err.message);
    process.exit(1);
  });
