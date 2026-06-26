const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `당신은 직장인의 고민을 따뜻하게 들어주는 공감 상담사입니다.
- 먼저 상대방의 감정에 충분히 공감하고 위로해주세요.
- 판단하지 말고 들어주는 자세를 유지하세요.
- 실질적인 조언이 필요해 보이면 부드럽게 제안하세요.
- 짧고 친근한 말투로, 마치 믿을 수 있는 선배 동료처럼 답변하세요.
- 답변은 3~5문장 내외로 간결하게 해주세요.`;

// JSON 응답 헬퍼
function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

// POST /api/chat 처리
async function handleChat(req, res) {
  let rawBody = '';
  req.on('data', (chunk) => {
    rawBody += chunk;
  });
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(rawBody || '{}');
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];

      if (messages.length === 0) {
        return sendJSON(res, 400, { error: 'messages 배열이 필요합니다.' });
      }

      // 시스템 프롬프트를 매 요청마다 맨 앞에 추가
      const payloadMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ];

      const openaiRes = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: payloadMessages,
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.error('OpenAI API 오류:', openaiRes.status, errText);
        return sendJSON(res, 502, {
          error: `OpenAI API 호출 실패 (status ${openaiRes.status})`,
        });
      }

      const data = await openaiRes.json();
      const reply = data?.choices?.[0]?.message?.content?.trim() || '';

      return sendJSON(res, 200, { reply });
    } catch (err) {
      console.error('handleChat 오류:', err);
      return sendJSON(res, 500, { error: '서버에서 오류가 발생했습니다.' });
    }
  });
  req.on('error', (err) => {
    console.error('요청 수신 오류:', err);
    sendJSON(res, 500, { error: '요청 처리 중 오류가 발생했습니다.' });
  });
}

// GET / 처리 (office-worries.html 서빙)
function serveHtml(res) {
  const filePath = path.join(__dirname, 'office-worries.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error('HTML 파일 읽기 오류:', err);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('office-worries.html 파일을 찾을 수 없습니다.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    return serveHtml(res);
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    return handleChat(req, res);
  }

  sendJSON(res, 404, { error: '요청한 경로를 찾을 수 없습니다.' });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
