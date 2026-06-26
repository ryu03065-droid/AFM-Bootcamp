// AI 별명 생성기 서버 (Node.js http 모듈 기반, Express 없이)
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- .env 직접 파싱 (dotenv 패키지 없이) ----
const env = {};
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) env[key.trim()] = vals.join('=').trim();
  });
} catch (err) {
  console.error('.env 파일을 읽을 수 없습니다:', err.message);
}

const GROQ_API_KEY = env.GROQ_API_KEY;
const PORT = env.PORT || 3000;

// ---- 공통 CORS 헤더 ----
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ---- 요청 body를 JSON으로 읽는 헬퍼 ----
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy(); // 과도한 페이로드 방어
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---- Groq API 호출 ----
async function generateNicknames({ name, personality, hobby }) {
  const systemPrompt =
    '당신은 재미있고 창의적인 별명을 만드는 전문가입니다. 항상 한국어로 답하세요.';
  const userPrompt =
    `이름: ${name}, 성격: ${personality}, 취미: ${hobby} 인 사람의 재미있고 개성 있는 별명을 5개 만들어주세요. ` +
    '번호 없이 각 별명을 줄바꿈으로만 구분해서 5개만 출력해주세요.';

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API 오류 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 줄바꿈으로 split → 빈 줄 제거 → 배열
  const nicknames = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return nicknames;
}

// ---- 서버 ----
const server = http.createServer(async (req, res) => {
  // 모든 응답에 CORS 헤더 적용
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  // OPTIONS preflight 처리
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // POST /api/nickname
  if (req.method === 'POST' && req.url === '/api/nickname') {
    try {
      const body = await readJsonBody(req);
      const { name = '', personality = '', hobby = '' } = body;

      if (!name || !personality || !hobby) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({ error: 'name, personality, hobby는 모두 필수입니다.' })
        );
      }

      const nicknames = await generateNicknames({ name, personality, hobby });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ nicknames }));
    } catch (err) {
      console.error('별명 생성 실패:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '별명 생성에 실패했습니다.' }));
    }
  }

  // GET / → index.html 서빙
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('index.html을 찾을 수 없습니다.');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  // 그 외 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
