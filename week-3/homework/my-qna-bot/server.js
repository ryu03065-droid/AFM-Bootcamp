require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

if (!GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY가 설정되지 않았습니다.');
}

// about-me.md 읽기
const aboutMePath = path.join(__dirname, 'about-me.md');
const aboutMe = fs.readFileSync(aboutMePath, 'utf-8');

const SYSTEM_PROMPT = `당신은 아래 [내 정보] 문서를 근거로 Amy(안소은)에 대한 질문에 답변하는 봇입니다.

규칙:
1. 반드시 아래 [내 정보]에 있는 내용만 근거로 답변하세요.
2. 문서에 없는 내용은 절대 지어내지 말고, "그 부분은 제가 알고 있는 정보에 없어요 🤔"라고 답하세요.
3. 친근하고 자연스러운 한국어로 답변하세요.
4. 간결하게 핵심만 전달하세요.

[내 정보]
${aboutMe}`;

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function handleAsk(req, res) {
  let rawBody = '';
  req.on('data', chunk => rawBody += chunk);
  req.on('end', async () => {
    try {
      const { question } = JSON.parse(rawBody || '{}');
      if (!question || !question.trim()) {
        return sendJSON(res, 400, { error: '질문을 입력해주세요.' });
      }
      if (!GROQ_API_KEY) {
        return sendJSON(res, 500, { error: 'GROQ_API_KEY가 설정되지 않았습니다.' });
      }

      const openaiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: question },
          ],
        }),
      });

      if (!openaiRes.ok) {
        const err = await openaiRes.text();
        throw new Error(`Groq API 오류 (${openaiRes.status}): ${err}`);
      }

      const data = await openaiRes.json();
      const answer = data?.choices?.[0]?.message?.content?.trim() || '';
      return sendJSON(res, 200, { answer });
    } catch (err) {
      console.error(err);
      return sendJSON(res, 500, { error: '서버 오류가 발생했습니다.' });
    }
  });
}

function serveHtml(res) {
  const filePath = path.join(__dirname, 'my-qna-bot.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('my-qna-bot.html 파일을 찾을 수 없습니다.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') return serveHtml(res);
  if (req.method === 'POST' && req.url === '/api/ask') return handleAsk(req, res);
  sendJSON(res, 404, { error: '경로를 찾을 수 없습니다.' });
});

server.listen(PORT, () => {
  console.log(`🤖 Amy Q&A 봇 서버: http://localhost:${PORT}`);
});
