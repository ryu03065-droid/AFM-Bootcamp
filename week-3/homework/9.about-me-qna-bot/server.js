require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3020;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

if (!GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY가 설정되지 않았습니다.');
}

// about-me.md 읽기 (섹션별로 나뉜 컨텍스트 문서)
const aboutMePath = path.join(__dirname, 'about-me.md');
const aboutMe = fs.readFileSync(aboutMePath, 'utf-8');

const SYSTEM_PROMPT = `당신은 아래 [내 정보]에 근거해 안소은(Amy)에 대한 질문에 답하는 Q&A 봇입니다.

규칙:
1. 반드시 아래 [내 정보]에 있는 내용만 근거로 답변하세요. 당신의 일반 지식을 사용하지 마세요.
2. [내 정보]에 없는 내용은 절대 지어내지 말고, "그 부분은 제가 알고 있는 정보에 없어요 🤔"라고 답하세요.
3. 친근하고 자연스러운 한국어로, 간결하게 핵심만 답변하세요.
4. 한자(漢字)를 절대 사용하지 마세요. 한글과 필요한 경우 영어 단어만 사용하세요.

[내 정보]
${aboutMe}`;

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGroq(question) {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

  if (groqRes.status === 429) {
    const errBody = await groqRes.text();
    const waitMatch = errBody.match(/try again in ([\d.]+)s/);
    const waitSeconds = waitMatch ? parseFloat(waitMatch[1]) : 3;
    const err = new Error(`Groq API 오류 (429): ${errBody}`);
    err.retryAfterMs = Math.ceil(waitSeconds * 1000) + 300;
    throw err;
  }

  if (!groqRes.ok) {
    const err = await groqRes.text();
    throw new Error(`Groq API 오류 (${groqRes.status}): ${err}`);
  }

  const data = await groqRes.json();
  const answer = data?.choices?.[0]?.message?.content?.trim() || '';
  // 한자(CJK Unified Ideographs) 제거
  return answer.replace(/[一-鿿]/g, '');
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

      const maxAttempts = 3;
      let lastErr;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const answer = await callGroq(question);
          return sendJSON(res, 200, { answer });
        } catch (err) {
          lastErr = err;
          if (err.retryAfterMs && attempt < maxAttempts) {
            console.warn(`토큰 한도 초과, ${err.retryAfterMs}ms 후 재시도 (${attempt}/${maxAttempts})`);
            await sleep(err.retryAfterMs);
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    } catch (err) {
      console.error(err);
      return sendJSON(res, 500, { error: '서버 오류가 발생했습니다.' });
    }
  });
}

function serveHtml(res) {
  const filePath = path.join(__dirname, 'about-me-qna-bot.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('about-me-qna-bot.html 파일을 찾을 수 없습니다.');
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
  console.log(`🤖 About Me Q&A 봇 서버: http://localhost:${PORT}`);
});
