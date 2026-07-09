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

const CATEGORY_KEYS = ['food', 'housing', 'transport', 'subscription', 'other'];
const CATEGORY_LABELS = { food: '식비', housing: '주거', transport: '교통', subscription: '구독료', other: '기타' };
const JOB_ROLES = ['기획', '디자인', '개발', '마케팅', '영업', '데이터', '기타'];
const BUCKET_COUNT = 6;

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salary_compare_entries (
      id SERIAL PRIMARY KEY,
      job_role TEXT NOT NULL,
      years_experience INTEGER NOT NULL,
      monthly_salary INTEGER NOT NULL,
      monthly_expense INTEGER NOT NULL,
      categories JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function validateEntry(body) {
  const { job_role, years_experience, monthly_salary, categories } = body;

  if (!JOB_ROLES.includes(job_role)) return '직군을 선택하세요.';

  const years = Number(years_experience);
  if (!Number.isInteger(years) || years < 0 || years > 50) return '연차를 올바르게 입력하세요.';

  const salary = Number(monthly_salary);
  if (!Number.isInteger(salary) || salary <= 0 || salary > 10000) return '월급(세전, 만원 단위)을 올바르게 입력하세요.';

  if (!categories || typeof categories !== 'object') return '카테고리별 지출을 입력하세요.';
  for (const key of CATEGORY_KEYS) {
    const v = Number(categories[key]);
    if (!Number.isInteger(v) || v < 0 || v > 5000) return `${CATEGORY_LABELS[key]} 지출을 올바르게 입력하세요.`;
  }

  return null;
}

// 분포 히스토그램: min~max 를 BUCKET_COUNT 구간으로 나누고 각 구간의 인원 수를 센다
function buildDistribution(salaries, mySalary) {
  const min = Math.min(...salaries);
  const max = Math.max(...salaries);
  const width = (max - min) / BUCKET_COUNT || 1;

  const buckets = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    from: Math.round(min + width * i),
    to: Math.round(min + width * (i + 1)),
    count: 0
  }));

  let myBucketIndex = 0;
  salaries.forEach((s) => {
    let idx = width === 0 ? 0 : Math.floor((s - min) / width);
    if (idx >= BUCKET_COUNT) idx = BUCKET_COUNT - 1;
    if (idx < 0) idx = 0;
    buckets[idx].count += 1;
    if (s === mySalary) myBucketIndex = idx;
  });

  return { buckets, myBucketIndex };
}

async function computeStats(mySalary) {
  const { rows } = await pool.query(
    `SELECT monthly_salary, monthly_expense, categories FROM salary_compare_entries`
  );

  const total = rows.length;
  const salaries = rows.map((r) => r.monthly_salary);
  const avgSalary = Math.round(salaries.reduce((a, b) => a + b, 0) / total);
  const avgExpense = Math.round(rows.reduce((a, r) => a + r.monthly_expense, 0) / total);

  const categoryAverages = {};
  CATEGORY_KEYS.forEach((key) => {
    const sum = rows.reduce((a, r) => a + Number(r.categories[key] || 0), 0);
    categoryAverages[key] = Math.round(sum / total);
  });

  const higher = salaries.filter((s) => s > mySalary).length;
  const rank = higher + 1;
  const topPercent = Math.max(1, Math.round((rank / total) * 100));

  const { buckets, myBucketIndex } = buildDistribution(salaries, mySalary);

  return { total, avgSalary, avgExpense, categoryAverages, topPercent, buckets, myBucketIndex };
}

// ── API ────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT monthly_salary FROM salary_compare_entries`);
    if (rows.length === 0) return res.json({ total: 0 });
    const stats = await computeStats(rows[rows.length - 1].monthly_salary);
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/entries', async (req, res) => {
  const error = validateEntry(req.body);
  if (error) return res.status(400).json({ error });

  const { job_role, years_experience, monthly_salary, categories } = req.body;
  const monthlyExpense = CATEGORY_KEYS.reduce((sum, key) => sum + Number(categories[key]), 0);
  const safeCategories = {};
  CATEGORY_KEYS.forEach((key) => { safeCategories[key] = Number(categories[key]); });

  try {
    const { rows } = await pool.query(
      `INSERT INTO salary_compare_entries (job_role, years_experience, monthly_salary, monthly_expense, categories)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, job_role, years_experience, monthly_salary, monthly_expense, categories, created_at`,
      [job_role, Number(years_experience), Number(monthly_salary), monthlyExpense, JSON.stringify(safeCategories)]
    );

    const entry = rows[0];
    const stats = await computeStats(entry.monthly_salary);
    res.status(201).json({ entry, stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
