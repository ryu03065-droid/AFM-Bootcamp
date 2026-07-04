require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

if (!GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY가 설정되지 않았습니다.');
}

// 저장소 루트 (week-3/homework/8.class-qna-bot 기준 3단계 상위)
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

// [텍스트 컨텍스트] 강의 노트
const LECTURE_NOTES_DIR = path.join(REPO_ROOT, 'lecture-notes');
const lectureNoteFiles = fs.existsSync(LECTURE_NOTES_DIR)
  ? fs.readdirSync(LECTURE_NOTES_DIR).filter(f => f.endsWith('.md')).sort()
  : [];

// [코드 컨텍스트] 수업 실습 코드 (server.js / client.js 중심)
const CODE_CONTEXT_FILES = [
  'week-2/02/client.js',
  'week-3/webserver-01/server.js',
  'week-3/webserver-02/server.js',
  'week-3/webserver-03/server.js',
  'week-4/todo-app-json/server.js',
  'week-4/todo-app-db/server.js',
  'week-4/memo-app/server.js',
];

// 모든 문서를 {id, label, type, content} 형태로 로드해둔다.
// Groq 무료 티어의 분당 토큰(TPM) 한도가 매우 낮기 때문에,
// 매번 전체 문서를 다 보내지 않고 질문과 관련된 문서만 골라서 보낸다 (간이 RAG).
const DOCS = [];

lectureNoteFiles.forEach(file => {
  const content = fs.readFileSync(path.join(LECTURE_NOTES_DIR, file), 'utf-8');
  DOCS.push({
    id: `note:${file}`,
    label: `📄 강의노트 ${file}`,
    type: 'note',
    text: `### 📄 ${file}\n\n${content}`,
  });
});

CODE_CONTEXT_FILES.forEach(relPath => {
  const fullPath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf-8');
  DOCS.push({
    id: `code:${relPath}`,
    label: `💻 코드 ${relPath}`,
    type: 'code',
    text: `### 💻 ${relPath}\n\n\`\`\`javascript\n${content}\n\`\`\``,
  });
});

console.log(`📚 강의 노트 ${lectureNoteFiles.length}개, 실습 코드 ${CODE_CONTEXT_FILES.length}개 로드 완료`);

const REFERENTIAL_PATTERN = /아까|방금|그거|그 코드|그거는|이전|위에서|말한\s*거|그때|저번|다시\s*알려/;

// 한글 조사/어미를 대충 잘라내는 간이 스테머.
// "코드를", "코드는", "코드인지"가 전부 다른 토큰으로 취급되면 문서 빈도가
// 낮아져서(=idf가 높아져서) 실제로는 흔한 단어인데 희귀한 것처럼 과대평가된다.
const KOREAN_PARTICLES = [
  '으로는', '에서는', '이라서', '해줘서', '인지도',
  '으로', '에서', '부터', '까지', '인지', '해줘', '이다', '이랑', '하고',
  '에게', '한테', '밖에', '는요', '이야', '이네', '으로써',
  '는', '은', '이', '가', '을', '를', '의', '에', '로', '와', '과',
  '도', '만', '요', '죠', '줘', '다', '서',
].sort((a, b) => b.length - a.length);

function stemKorean(word) {
  for (const p of KOREAN_PARTICLES) {
    if (word.length - p.length >= 2 && word.endsWith(p)) {
      return word.slice(0, word.length - p.length);
    }
  }
  return word;
}

function tokenize(text) {
  // 영문/숫자 토큰(파일명, 경로 등)과 한글 토큰을 따로 추출한다.
  // 하나의 char class로 묶으면 "webserver-01의"처럼 한글 조사가 파일명에
  // 붙어버려서 정확한 파일명 매칭이 깨지기 때문에 분리한다.
  const ascii = text.match(/[a-zA-Z0-9][a-zA-Z0-9._-]*/g) || [];
  const korean = (text.match(/[가-힣]{2,}/g) || []).map(stemKorean).filter(t => t.length >= 2);
  return [...ascii, ...korean].map(t => t.toLowerCase());
}

// "설명해줘", "보여줘", "궁금해" 같이 질문 형식을 이루는 범용 단어들.
// 코드 파일에는 한글이 아예 없기 때문에, 질문에 섞인 이런 범용 한글 단어가
// 우연히 노트 한 곳에만 등장하면 그게 진짜 관련 있는 것처럼 과대평가된다.
// 검색용 질문 토큰에서는 이런 범용어를 제거해서 실제 주제어만 남긴다.
const QUERY_STOPWORDS = new Set([
  '설명', '보여주', '보여줘', '알려주', '알려줘', '궁금', '물어보',
  '대해', '싶어', '싶다', '하는', '뭐야', '뭘', '그거', '그것', '저번',
  '다시', '있어', '없어', '같아', '같은', '한다', '했다', '합니다',
  '질문', '답변', '내용',
]);

// 문서 빈도(DF) 기반 가중치. "코드", "설명" 같이 거의 모든 문서에 등장하는
// 흔한 단어는 점수에 거의 기여하지 않고, "webserver-01"처럼 소수 문서에만
// 등장하는 단어가 훨씬 큰 가중치를 갖도록 한다 (간이 TF-IDF).
const DOC_TOKEN_SETS = DOCS.map(doc => new Set(tokenize(doc.text)));
const DOC_FREQ = new Map();
DOC_TOKEN_SETS.forEach(tokenSet => {
  tokenSet.forEach(t => DOC_FREQ.set(t, (DOC_FREQ.get(t) || 0) + 1));
});

function idf(token) {
  const df = DOC_FREQ.get(token) || 0;
  return Math.log((DOCS.length + 1) / (df + 1)) + 0.1;
}

function scoreDoc(docIndex, tokens) {
  const tokenSet = DOC_TOKEN_SETS[docIndex];
  const uniqueTokens = new Set(tokens);
  let score = 0;
  uniqueTokens.forEach(t => {
    if (tokenSet.has(t)) score += idf(t);
  });
  return score;
}

// 질문과 관련된 문서를 뽑는다. 지시어("아까", "방금" 등)가 있으면
// 직전 턴에서 참조했던 문서를 함께(또는 대신) 포함해서 대화 맥락을 이어간다.
function retrieveDocs(question, session, topN = 2) {
  const tokens = tokenize(question).filter(t => !QUERY_STOPWORDS.has(t));
  const scored = DOCS
    .map((doc, i) => ({ doc, score: scoreDoc(i, tokens) }))
    .sort((a, b) => b.score - a.score);

  let selected = scored.filter(s => s.score > 0).slice(0, topN).map(s => s.doc);

  const isReferential = REFERENTIAL_PATTERN.test(question);
  if ((isReferential || selected.length === 0) && session.lastDocIds.length > 0) {
    const lastDocs = session.lastDocIds
      .map(id => DOCS.find(d => d.id === id))
      .filter(Boolean);
    // "아까 그거"처럼 직전 문서를 가리키는 질문이면, 그 문서가 잘리지 않도록
    // 먼저 넣고(우선순위 최상단) 남는 자리에 새로 스코어링된 문서를 채운다.
    const byId = new Map(lastDocs.map(d => [d.id, d]));
    selected.forEach(d => byId.set(d.id, d));
    selected = Array.from(byId.values()).slice(0, topN + 1);
  }

  // 그래도 하나도 없으면(첫 인사 등) 강의노트 전체 목차 정도는 참고할 수 있게 최신 노트 1개만 기본 포함
  if (selected.length === 0) {
    const fallback = DOCS.filter(d => d.type === 'note').slice(-1);
    selected = fallback;
  }

  session.lastDocIds = selected.map(d => d.id);
  return selected;
}

function buildSystemPrompt(docs) {
  const contextText = docs.map(d => d.text).join('\n\n---\n\n');
  return `당신은 하버스쿨 부트캠프 수강생을 돕는 "수업 Q&A 봇"입니다.
아래 [참고 자료] (강의 노트 / 실습 코드)를 근거로 수업에서 배운 내용에 대한 질문에 답변합니다.

규칙:
1. 반드시 아래 [참고 자료]에 있는 내용을 근거로 답변하세요.
2. 근거 자료에 없는 내용은 절대 지어내지 말고, "그 내용은 제가 가진 수업 자료에는 없어요 🤔"라고 답하세요.
3. 코드에 대한 질문에는 실제 [참고 자료]의 파일 경로를 언급하며 핵심 부분만 짧게 인용해 설명하세요. 코드 전체를 복사하지 말고 관련된 몇 줄만 인용하세요.
4. 대화 기록(직전 질문/답변)을 기억하고 이어서 답변하세요. "아까 그거", "방금 말한 거" 같은 표현은 직전 대화를 가리킵니다.
5. 친근하고 간결한 한국어로 답변하세요. 5~7문장 이내로 핵심만 전달하세요.

[참고 자료]
${contextText}`;
}

// 세션별 대화 메모리 (in-memory) — 대화 기록 + 직전에 참조한 문서 목록을 함께 기억한다.
const sessions = new Map();
const MAX_HISTORY_MESSAGES = 8; // user/assistant 합쳐 최근 8개(4턴)까지만 기억

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { history: [], lastDocIds: [] });
  }
  return sessions.get(sessionId);
}

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGroq(systemPrompt, history) {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      max_tokens: 500,
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
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function handleAsk(req, res) {
  let rawBody = '';
  req.on('data', chunk => rawBody += chunk);
  req.on('end', async () => {
    try {
      const { question, sessionId: rawSessionId } = JSON.parse(rawBody || '{}');
      const sessionId = rawSessionId || crypto.randomUUID();

      if (!question || !question.trim()) {
        return sendJSON(res, 400, { error: '질문을 입력해주세요.' });
      }
      if (!GROQ_API_KEY) {
        return sendJSON(res, 500, { error: 'GROQ_API_KEY가 설정되지 않았습니다.' });
      }

      const session = getSession(sessionId);
      const relevantDocs = retrieveDocs(question, session);
      const systemPrompt = buildSystemPrompt(relevantDocs);

      session.history.push({ role: 'user', content: question });

      const maxAttempts = 3;
      let lastErr;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const answer = await callGroq(systemPrompt, session.history);
          session.history.push({ role: 'assistant', content: answer });
          if (session.history.length > MAX_HISTORY_MESSAGES) {
            session.history.splice(0, session.history.length - MAX_HISTORY_MESSAGES);
          }
          return sendJSON(res, 200, {
            answer,
            sessionId,
            usedDocs: relevantDocs.map(d => d.label),
          });
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

async function handleReset(req, res) {
  let rawBody = '';
  req.on('data', chunk => rawBody += chunk);
  req.on('end', () => {
    try {
      const { sessionId } = JSON.parse(rawBody || '{}');
      if (sessionId) sessions.delete(sessionId);
      return sendJSON(res, 200, { ok: true });
    } catch (err) {
      return sendJSON(res, 500, { error: '서버 오류가 발생했습니다.' });
    }
  });
}

function serveHtml(res) {
  const filePath = path.join(__dirname, 'class-qna-bot.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('class-qna-bot.html 파일을 찾을 수 없습니다.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') return serveHtml(res);
  if (req.method === 'POST' && req.url === '/api/ask') return handleAsk(req, res);
  if (req.method === 'POST' && req.url === '/api/reset') return handleReset(req, res);
  sendJSON(res, 404, { error: '경로를 찾을 수 없습니다.' });
});

server.listen(PORT, () => {
  console.log(`🎓 수업 Q&A 봇 서버: http://localhost:${PORT}`);
});
