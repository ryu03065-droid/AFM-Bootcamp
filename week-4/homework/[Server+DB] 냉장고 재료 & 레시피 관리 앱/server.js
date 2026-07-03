require('dotenv').config();
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

// ── 재료 API ──────────────────────────────────────────

app.get('/api/ingredients', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ingredients ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ingredients', async (req, res) => {
  const { name, category } = req.body;
  if (!name) return res.status(400).json({ error: '재료 이름은 필수입니다.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO ingredients (name, category) VALUES ($1, $2) RETURNING *',
      [name, category]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ingredients WHERE id = $1', [req.params.id]);
    res.json({ message: '삭제 완료' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 레시피 API ────────────────────────────────────────

app.get('/api/recipes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM recipes ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/recipes', async (req, res) => {
  const { title, ingredients, steps } = req.body;
  if (!title) return res.status(400).json({ error: '레시피 이름은 필수입니다.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO recipes (title, ingredients, steps) VALUES ($1, $2, $3) RETURNING *',
      [title, ingredients, steps]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM recipes WHERE id = $1', [req.params.id]);
    res.json({ message: '삭제 완료' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
