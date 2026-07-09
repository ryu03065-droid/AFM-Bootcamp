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

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balance_questions (
      id SERIAL PRIMARY KEY,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balance_votes (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES balance_questions(id) ON DELETE CASCADE,
      voter_token TEXT NOT NULL,
      choice CHAR(1) NOT NULL CHECK (choice IN ('a', 'b')),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (question_id, voter_token)
    )
  `);
}

const QUESTION_SELECT = `
  SELECT
    q.id, q.option_a, q.option_b, q.created_at,
    COUNT(v.id) FILTER (WHERE v.choice = 'a')::int AS votes_a,
    COUNT(v.id) FILTER (WHERE v.choice = 'b')::int AS votes_b
  FROM balance_questions q
  LEFT JOIN balance_votes v ON v.question_id = q.id
`;

// 투표율 계산: DB에서 받은 원시 집계(votes_a, votes_b)를 퍼센티지로 가공하는 것은 서버의 책임
function withRates(row) {
  const total = row.votes_a + row.votes_b;
  const pct_a = total === 0 ? 50 : Math.round((row.votes_a / total) * 100);
  return { ...row, total, pct_a, pct_b: 100 - pct_a };
}

// ── 질문 API ────────────────────────────────────────

app.get('/api/questions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${QUESTION_SELECT} GROUP BY q.id ORDER BY q.created_at DESC`
    );
    res.json(rows.map(withRates));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions', async (req, res) => {
  const { option_a, option_b } = req.body;
  if (!option_a || !option_a.trim() || !option_b || !option_b.trim()) {
    return res.status(400).json({ error: '두 가지 선택지를 모두 입력하세요.' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO balance_questions (option_a, option_b) VALUES ($1, $2) RETURNING id',
      [option_a.trim(), option_b.trim()]
    );
    const { rows: full } = await pool.query(`${QUESTION_SELECT} WHERE q.id = $1 GROUP BY q.id`, [rows[0].id]);
    res.status(201).json(withRates(full[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions/:id/vote', async (req, res) => {
  const { choice, voter_token } = req.body;
  if (choice !== 'a' && choice !== 'b') return res.status(400).json({ error: '선택지가 올바르지 않습니다.' });
  if (!voter_token) return res.status(400).json({ error: 'voter_token이 필요합니다.' });
  try {
    await pool.query(
      `INSERT INTO balance_votes (question_id, voter_token, choice) VALUES ($1, $2, $3)
       ON CONFLICT (question_id, voter_token) DO UPDATE SET choice = EXCLUDED.choice`,
      [req.params.id, voter_token, choice]
    );
    const { rows } = await pool.query(`${QUESTION_SELECT} WHERE q.id = $1 GROUP BY q.id`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '질문을 찾을 수 없습니다.' });
    res.json(withRates(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
