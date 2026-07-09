require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
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

// ── AI 소비 분석가 (질의응답) API ────────────────────────────────

function callGroq(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0,
      max_tokens: 1024,
    });
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.choices) return reject(new Error(json.error?.message || 'Groq 응답 오류'));
          resolve(json.choices[0].message.content);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 합계·평균·최댓값류 질문에서 LLM이 원본 행을 직접 암산하다 틀리는 걸 막기 위해,
// 자주 쓰이는 집계는 서버가 SQL로 미리 계산해서 표로 제공하고 LLM은 조회만 하게 한다.
async function buildLedgerContext() {
  const { rows } = await pool.query(
    `SELECT type, entry_date, category, amount, memo
     FROM ledger_entries
     ORDER BY entry_date ASC, id ASC
     LIMIT 3000`
  );
  if (rows.length === 0) return null;

  const lines = rows.map((r) => {
    const wd = WEEKDAY_KO[new Date(r.entry_date + 'T00:00:00Z').getUTCDay()];
    const sign = r.type === 'income' ? '수입' : '지출';
    const memo = r.memo ? ` | ${r.memo}` : '';
    return `${r.entry_date}(${wd}) | ${sign} | ${r.category} | ${r.amount}원${memo}`;
  });

  const [byMonth, byDay, byWeekday, byCategory] = await Promise.all([
    pool.query(`
      SELECT to_char(entry_date,'YYYY-MM') AS k, type, SUM(amount)::int AS total, COUNT(*) AS cnt
      FROM ledger_entries GROUP BY k, type ORDER BY k`),
    pool.query(`
      SELECT to_char(entry_date,'YYYY-MM-DD') AS k, SUM(amount)::int AS total, COUNT(*) AS cnt
      FROM ledger_entries WHERE type='expense' GROUP BY k ORDER BY total DESC LIMIT 15`),
    pool.query(`
      SELECT EXTRACT(DOW FROM entry_date)::int AS dow, SUM(amount)::int AS total, COUNT(*) AS cnt
      FROM ledger_entries WHERE type='expense' GROUP BY dow ORDER BY total DESC`),
    pool.query(`
      SELECT to_char(entry_date,'YYYY-MM') AS month, type, category, SUM(amount)::int AS total, COUNT(*) AS cnt
      FROM ledger_entries GROUP BY month, type, category ORDER BY month, type, total DESC`),
  ]);

  const monthTable = byMonth.rows
    .map((r) => `${r.k} | ${r.type === 'income' ? '수입' : '지출'} | 합계 ${r.total}원 | ${r.cnt}건`)
    .join('\n');
  const dayTable = byDay.rows
    .map((r) => `${r.k} | 지출 합계 ${r.total}원 | ${r.cnt}건`)
    .join('\n');
  const weekdayTable = byWeekday.rows
    .map((r) => `${WEEKDAY_KO[r.dow]}요일 | 지출 합계 ${r.total}원 | ${r.cnt}건`)
    .join('\n');
  const categoryTable = byCategory.rows
    .map((r) => `${r.month} | ${r.type === 'income' ? '수입' : '지출'} | ${r.category} | 합계 ${r.total}원 | ${r.cnt}건`)
    .join('\n');

  const months = [...new Set(rows.map((r) => r.entry_date.slice(0, 7)))];
  return {
    rawText: lines.join('\n'),
    monthTable,
    dayTable,
    weekdayTable,
    categoryTable,
    count: rows.length,
    months,
  };
}

app.post('/api/ask', async (req, res) => {
  const question = (req.body.question || '').trim();
  if (!question) return res.status(400).json({ error: '질문을 입력하세요.' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' });

  try {
    const context = await buildLedgerContext();
    if (!context) {
      return res.json({ answer: '아직 가계부에 등록된 내역이 없어요. 먼저 내역을 등록해주세요.' });
    }

    const systemPrompt = `너는 사용자의 개인 가계부 데이터를 분석해주는 소비 분석가야.
아래 데이터에 근거해서만 답하고, 데이터에 없는 내용은 추측하지 말고 "데이터에서 확인할 수 없어요"라고 말해.
숫자는 천단위 콤마와 "원" 단위를 붙여줘. 답변은 한국어로, 핵심만 간결하게 (불필요한 서론 없이 2~4문장 또는 짧은 목록).

**중요**: 합계·평균·"가장 많이 쓴 날/요일/카테고리" 같은 질문은 아래 [사전 집계 표]에 이미 계산되어 있으니
그 값을 그대로 인용해서 답해. 절대 원본 내역을 다시 합산하려 하지 마 (계산 실수가 나기 쉬움).
표에 없는 세부 질문(특정 날짜에 뭘 샀는지 등)만 [원본 내역]에서 찾아서 답해.

[사전 집계 - 월별 수입/지출 합계]
${context.monthTable}

[사전 집계 - 카테고리별 월간 합계 (수입+지출)]
${context.categoryTable}

[사전 집계 - 지출 많은 날 TOP 15]
${context.dayTable}

[사전 집계 - 요일별 지출 합계]
${context.weekdayTable}

[원본 내역: 총 ${context.count}건, ${context.months.join(', ')}] (형식: 날짜(요일) | 구분 | 카테고리 | 금액 | 메모)
${context.rawText}`;

    const answer = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ]);

    res.json({ answer: answer.trim() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3005;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
