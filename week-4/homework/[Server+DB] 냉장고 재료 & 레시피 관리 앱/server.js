require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const https = require('https');

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

// ── AI 레시피 생성 API ────────────────────────────────

async function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
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
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.choices[0].message.content);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.post('/api/recipes/generate', async (req, res) => {
  const { style } = req.body; // 간단요리 | 다이어트 | 야식 | 아무거나
  try {
    const { rows: ingredients } = await pool.query('SELECT name, category FROM ingredients ORDER BY created_at DESC');
    if (ingredients.length === 0) return res.status(400).json({ error: '냉장고에 재료가 없습니다. 먼저 재료를 추가하세요!' });

    const ingList = ingredients.map(i => i.category ? `${i.name}(${i.category})` : i.name).join(', ');
    const styleNote = style && style !== '아무거나' ? `스타일: ${style} 요리로 만들어줘.` : '';

    const prompt = `너는 자취생을 위한 요리 전문가야. 아래 냉장고 재료로 만들 수 있는 레시피 1개를 추천해줘.

냉장고 재료: ${ingList}
${styleNote}

조건:
- 1인분 기준
- 15분~30분 이내로 만들 수 있는 요리
- 자취생이 쉽게 따라할 수 있는 난이도

아래 JSON 형식으로만 답해. 다른 말은 하지 마:
{
  "title": "요리 이름",
  "ingredients": "사용할 재료와 양 (예: 달걀 2개, 김치 100g)",
  "steps": "1. 첫번째 단계\\n2. 두번째 단계\\n3. 세번째 단계",
  "time": "예상 조리시간 (예: 15분)",
  "difficulty": "난이도 (쉬움 / 보통 / 어려움)"
}`;

    const aiResponse = await callGroq(prompt);
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI 응답 파싱 실패' });

    const recipe = JSON.parse(jsonMatch[0]);
    res.json(recipe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
