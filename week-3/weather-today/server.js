require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(require('path').join(__dirname, 'weather-today.html')));

const pool = new Pool({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.irfvftnlvbyfuagajrmg',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

pool.query(`
  CREATE TABLE IF NOT EXISTS weather_favorites (
    id SERIAL PRIMARY KEY,
    city_name TEXT NOT NULL,
    local_name TEXT,
    country TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (lat, lon)
  )
`).catch((e) => console.error('테이블 생성 실패:', e.message));

const API_KEY = process.env.OWM_API_KEY;
const API_BASE = 'https://api.openweathermap.org/data/2.5';
const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

// ── 도시 검색 (지오코딩) 프록시 ──────────────────────────

app.get('/api/geocode', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: '검색어가 필요합니다.' });
  try {
    const r = await fetch(`${GEO_BASE}/direct?q=${encodeURIComponent(q)}&limit=5&appid=${API_KEY}`);
    if (!r.ok) throw new Error('도시 검색에 실패했습니다.');
    const json = await r.json();
    res.json(
      json.map((c) => ({
        name: c.name,
        localName: (c.local_names && c.local_names.ko) || c.name,
        state: c.state || '',
        country: c.country || '',
        lat: c.lat,
        lon: c.lon,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 날씨(현재 + 예보 + UV) 통합 프록시 ──────────────────

app.get('/api/weather', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: '위/경도가 필요합니다.' });
  try {
    const [curRes, fcRes] = await Promise.all([
      fetch(`${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`),
      fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`),
    ]);
    if (!curRes.ok || !fcRes.ok) throw new Error('날씨 데이터를 불러오지 못했습니다.');

    let uvIndex = null;
    try {
      const uvRes = await fetch(`${API_BASE}/uvi?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
      if (uvRes.ok) {
        const uvJson = await uvRes.json();
        uvIndex = typeof uvJson.value === 'number' ? Math.round(uvJson.value) : null;
      }
    } catch {
      uvIndex = null;
    }

    // OpenWeatherMap /weather 응답의 city name은 lang 파라미터와 무관하게 항상 영문이라
    // 한글 표기가 필요하면 Reverse Geocoding으로 local_names.ko를 별도 조회해야 함
    let cityLocalName = null;
    try {
      const revRes = await fetch(`${GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`);
      if (revRes.ok) {
        const revJson = await revRes.json();
        cityLocalName = revJson[0]?.local_names?.ko || null;
      }
    } catch {
      cityLocalName = null;
    }

    const current = await curRes.json();
    const forecast = await fcRes.json();
    res.json({ current, forecast, uvIndex, cityLocalName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 즐겨찾기 CRUD ────────────────────────────────────────

app.get('/api/favorites', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM weather_favorites ORDER BY created_at ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/favorites', async (req, res) => {
  const { cityName, localName, country, lat, lon } = req.body;
  if (!cityName || lat == null || lon == null) {
    return res.status(400).json({ error: '도시 정보가 필요합니다.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO weather_favorites (city_name, local_name, country, lat, lon)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (lat, lon) DO NOTHING
       RETURNING *`,
      [cityName, localName || null, country || null, lat, lon]
    );
    res.status(201).json(rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/favorites/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM weather_favorites WHERE id = $1', [req.params.id]);
    res.json({ message: '삭제 완료' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`날씨 앱 서버 실행 중: http://localhost:${PORT}`));
