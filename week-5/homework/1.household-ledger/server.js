require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool, types } = require('pg');

// DATE 컬럼(oid 1082)은 시간대가 없으므로, pg가 로컬 타임존 기준 Date 객체로
// 파싱해 JSON 직렬화 시 하루가 밀리는 문제를 막기 위해 원본 문자열 그대로 반환한다.
types.setTypeParser(1082, (val) => val);

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

const CATEGORIES = {
  income: ['급여', '용돈', '부수입', '기타'],
  expense: ['식비', '교통', '주거', '통신비', '구독료', '보험', '의료', '교육', '문화/여가', '쇼핑', '경조사', '반려동물', '기타'],
};

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      entry_date DATE NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      category TEXT NOT NULL,
      memo TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function validateEntry(body) {
  const { type, entry_date, amount, category, memo } = body;
  if (type !== 'income' && type !== 'expense') return '수입/지출 구분이 올바르지 않습니다.';
  if (!entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) return '날짜를 올바르게 입력하세요.';
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) return '금액을 올바르게 입력하세요.';
  if (!CATEGORIES[type].includes(category)) return '카테고리가 올바르지 않습니다.';
  if (memo && memo.length > 200) return '메모는 200자 이내로 입력하세요.';
  return null;
}

function parseMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  return month;
}

// ── 내역 API ────────────────────────────────────────

app.get('/api/entries', async (req, res) => {
  const month = parseMonth(req.query.month);
  if (!month) return res.status(400).json({ error: 'month=YYYY-MM 형식으로 요청하세요.' });
  try {
    const { rows } = await pool.query(
      `SELECT id, type, entry_date, amount, category, memo, created_at
       FROM ledger_entries
       WHERE to_char(entry_date, 'YYYY-MM') = $1
       ORDER BY entry_date DESC, id DESC`,
      [month]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/entries', async (req, res) => {
  const error = validateEntry(req.body);
  if (error) return res.status(400).json({ error });
  const { type, entry_date, amount, category, memo } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ledger_entries (type, entry_date, amount, category, memo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, entry_date, amount, category, memo, created_at`,
      [type, entry_date, Number(amount), category, (memo || '').trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/entries/:id', async (req, res) => {
  const error = validateEntry(req.body);
  if (error) return res.status(400).json({ error });
  const { type, entry_date, amount, category, memo } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE ledger_entries
       SET type = $1, entry_date = $2, amount = $3, category = $4, memo = $5
       WHERE id = $6
       RETURNING id, type, entry_date, amount, category, memo, created_at`,
      [type, entry_date, Number(amount), category, (memo || '').trim() || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM ledger_entries WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
    res.json({ ok: true, id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 카테고리별 합계 API ────────────────────────────────────────

app.get('/api/summary', async (req, res) => {
  const month = parseMonth(req.query.month);
  if (!month) return res.status(400).json({ error: 'month=YYYY-MM 형식으로 요청하세요.' });
  try {
    const { rows } = await pool.query(
      `SELECT type, category, SUM(amount)::int AS amount
       FROM ledger_entries
       WHERE to_char(entry_date, 'YYYY-MM') = $1
       GROUP BY type, category`,
      [month]
    );

    const incomeTotal = rows.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0);
    const expenseTotal = rows.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0);

    const expenseByCategory = rows
      .filter((r) => r.type === 'expense')
      .map((r) => ({ category: r.category, amount: r.amount }))
      .sort((a, b) => b.amount - a.amount);

    const incomeByCategory = rows
      .filter((r) => r.type === 'income')
      .map((r) => ({ category: r.category, amount: r.amount }))
      .sort((a, b) => b.amount - a.amount);

    res.json({
      month,
      incomeTotal,
      expenseTotal,
      balance: incomeTotal - expenseTotal,
      expenseByCategory,
      incomeByCategory,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3004;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
