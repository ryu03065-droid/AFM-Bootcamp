require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENWEATHER_API_KEY = (process.env.OPENWEATHER_API_KEY || '').trim();

// API 키 누락 경고
if (!OPENWEATHER_API_KEY) {
  console.warn('⚠️  OPENWEATHER_API_KEY가 설정되지 않았습니다. .env 파일에 키를 입력해주세요.');
}

app.use(express.static(__dirname));

// 기온별 옷차림 추천
function getOutfitRecommendation(temp) {
  if (temp < 5) {
    return { level: '한파', emoji: '🧥', outfit: '패딩 필수', detail: '두꺼운 패딩 + 목도리 + 장갑 + 히트텍 레이어링', color: '#60a5fa' };
  } else if (temp < 10) {
    return { level: '추위', emoji: '🧣', outfit: '코트 추천', detail: '두꺼운 코트 + 히트텍 + 니트 + 목도리', color: '#818cf8' };
  } else if (temp < 15) {
    return { level: '쌀쌀', emoji: '🧤', outfit: '자켓 필요', detail: '자켓 + 가디건 + 청바지 + 스카프', color: '#a78bfa' };
  } else if (temp < 20) {
    return { level: '선선', emoji: '👔', outfit: '가을 패션', detail: '얇은 자켓 + 맨투맨 + 슬랙스', color: '#34d399' };
  } else if (temp < 24) {
    return { level: '적당', emoji: '👕', outfit: '긴팔 OK', detail: '긴팔 티셔츠 + 면바지', color: '#fbbf24' };
  } else if (temp < 28) {
    return { level: '따뜻', emoji: '🌤️', outfit: '반팔 OK', detail: '반팔 + 얇은 바지 · 치마', color: '#fb923c' };
  } else {
    return { level: '더위', emoji: '☀️', outfit: '민소매 추천', detail: '민소매 · 반팔 + 반바지 · 짧은 치마, 선크림 필수!', color: '#f87171' };
  }
}

// OpenWeatherMap 날씨 그룹(weather[0].main) → 이모지
function getWeatherEmoji(main) {
  switch (main) {
    case 'Clear': return '☀️';
    case 'Clouds': return '☁️';
    case 'Rain': return '🌧️';
    case 'Drizzle': return '🌦️';
    case 'Thunderstorm': return '⛈️';
    case 'Snow': return '❄️';
    case 'Mist':
    case 'Fog':
    case 'Haze':
    case 'Smoke': return '🌫️';
    default: return '🌤️';
  }
}

// GET /recommend?lat=37.5665&lon=126.9780
app.get('/recommend', async (req, res) => {
  const lat = parseFloat(req.query.lat) || 37.5665; // 기본: 서울
  const lon = parseFloat(req.query.lon) || 126.9780;

  if (!OPENWEATHER_API_KEY) {
    return res.status(500).json({ error: 'OPENWEATHER_API_KEY가 설정되지 않았습니다.' });
  }

  try {
    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;

    const weatherRes = await fetch(url);

    if (!weatherRes.ok) {
      const body = await weatherRes.text();
      throw new Error(`OpenWeatherMap API 호출 실패 (${weatherRes.status}): ${body}`);
    }

    const data = await weatherRes.json();

    const temp = Math.round(data.main.temp);
    const feelsLike = Math.round(data.main.feels_like);
    const windspeed = Math.round((data.wind?.speed ?? 0) * 3.6); // m/s → km/h
    const weatherMain = data.weather?.[0]?.main ?? '';
    const description = data.weather?.[0]?.description ?? '알 수 없음';
    const weatherDesc = `${description} ${getWeatherEmoji(weatherMain)}`;

    const recommendation = getOutfitRecommendation(feelsLike); // 체감온도 기준

    res.json({
      temperature: temp,
      feelsLike,
      windspeed,
      weatherDesc,
      recommendation,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: '날씨 정보를 가져오지 못했습니다.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'weather-outfit.html'));
});

app.listen(PORT, () => {
  console.log(`👗 날씨 옷차림 서버: http://localhost:${PORT}`);
});
