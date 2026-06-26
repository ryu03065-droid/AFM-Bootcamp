const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `당신은 수백 년의 내공을 가진 신비로운 점술가 '몽선생'입니다.
사용자가 꿈 내용을 말하면, 반드시 다음 JSON 형식만 반환하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "summary": "꿈 전체를 한 문장으로 요약",
  "keywords": ["상징 키워드1", "상징 키워드2", "상징 키워드3"],
  "omen": "길몽" 또는 "흉몽" 또는 "중립몽",
  "luckScore": 0~100 사이의 정수 (길몽일수록 높게),
  "interpretation": "꿈 해몽 내용 (신비롭고 운명적인 말투로, 3~5문장)",
  "advice": "오늘 하루를 위한 한 줄 조언"
}

출력 순서: 반드시 1)summary 2)keywords 3)omen+luckScore 4)interpretation 5)advice 순서로 답할 것.

말투 특징:
- "~하리라", "~이로다", "~도다", "~하거늘" 같은 고풍스러운 표현 사용
- 별, 달, 운명, 기운, 천기 등의 단어를 자연스럽게 활용
- 위엄 있고 신비로운 분위기 유지
- 길흉과 행운지수는 꿈 내용을 면밀히 분석해 판단할 것`;

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function handleDream(req, res) {
  let rawBody = '';
  req.on('data', (chunk) => { rawBody += chunk; });
  req.on('end', async () => {
    try {
      const { dream } = JSON.parse(rawBody || '{}');
      if (!dream || dream.trim() === '') {
        return sendJSON(res, 400, { error: '꿈 내용을 입력해주세요.' });
      }

      const openaiRes = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `어젯밤 꿈: ${dream}` },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.error('OpenAI API 오류:', openaiRes.status, errText);
        return sendJSON(res, 502, { error: `API 호출 실패 (status ${openaiRes.status})` });
      }

      const data = await openaiRes.json();
      const content = data?.choices?.[0]?.message?.content || '{}';
      const result = JSON.parse(content);

      return sendJSON(res, 200, result);
    } catch (err) {
      console.error('handleDream 오류:', err);
      return sendJSON(res, 500, { error: '서버에서 오류가 발생했습니다.' });
    }
  });
}

function serveHtml(res) {
  const filePath = path.join(__dirname, 'dream-interpreter.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('dream-interpreter.html 파일을 찾을 수 없습니다.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') return serveHtml(res);
  if (req.method === 'POST' && req.url === '/api/dream') return handleDream(req, res);
  sendJSON(res, 404, { error: '요청한 경로를 찾을 수 없습니다.' });
});

server.listen(PORT, () => {
  console.log(`🔮 몽선생 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
