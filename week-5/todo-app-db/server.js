// Todo App Server (Postgres/DB 버전)
// 저장: Supabase Postgres. pooler(transaction mode, 6543) 이므로 prepared statement 비활성화 필수.
//   - 드라이버: postgres (porsager) — `prepare: false`
//   - 정적 파일은 Node 내장 http 로 직접 서빙

const http = require('http');
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET 환경변수가 필요합니다.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '7d';

// 연결 문자열 (env 로 덮어쓸 수 있게 하되, 제공된 URL 을 기본값으로)
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres.fhphxvjqxroqnwaccudi:3lDTqn9rCvPJ8sJ8@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

// pgbouncer transaction mode 호환 설정
const sql = postgres(DATABASE_URL, {
  prepare: false, // ★ transaction pooler 에서는 prepared statement 사용 불가
  ssl: 'require',
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
});

// 테이블 생성
// 이 DB 는 다른 앱과 공유되며 기존 "todos" 테이블(title/completed 스키마)에 실데이터가 있으므로
// 이 앱 전용 테이블(todo_app_db_todos)을 별도로 사용한다.
async function initDb() {
  await sql`
    create table if not exists users (
      id            bigint generated always as identity primary key,
      username      text not null unique,
      password_hash text not null,
      created_at    timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists todo_app_db_todos (
      id         bigint generated always as identity primary key,
      user_id    bigint not null references users(id) on delete cascade,
      text       text not null,
      done       boolean not null default false,
      created_at timestamptz not null default now()
    )
  `;
}

// ---------------------------------------------------------------------------
// 인증 (회원가입 / 로그인 / JWT)
// ---------------------------------------------------------------------------
async function signup(username, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await sql`
    insert into users ${sql({ username, password_hash: passwordHash }, 'username', 'password_hash')}
    returning id, username
  `;
  return user;
}

async function login(username, password) {
  const [user] = await sql`select id, username, password_hash from users where username = ${username}`;
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, username: user.username };
}

function issueToken(user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function getAuthUser(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    return { id: Number(payload.sub), username: payload.username };
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 데이터 접근 함수
// ---------------------------------------------------------------------------
async function getTodos(userId) {
  return await sql`select id, text, done from todo_app_db_todos where user_id = ${userId} order by id asc`;
}

async function createTodo(userId, text) {
  const [row] = await sql`
    insert into todo_app_db_todos ${sql({ user_id: userId, text, done: false }, 'user_id', 'text', 'done')}
    returning id, text, done
  `;
  return row;
}

async function toggleTodo(userId, id) {
  const [row] = await sql`
    update todo_app_db_todos set done = not done where id = ${id} and user_id = ${userId}
    returning id, text, done
  `;
  return row || null;
}

async function deleteTodo(userId, id) {
  const [row] = await sql`delete from todo_app_db_todos where id = ${id} and user_id = ${userId} returning id`;
  return !!row;
}

// ---------------------------------------------------------------------------
// 헬퍼: 응답 / 본문 파싱
// ---------------------------------------------------------------------------
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('잘못된 JSON 본문입니다.'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// 정적 파일 서빙
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serveStatic(res, fileName) {
  const filePath = path.join(ROOT, fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (fileName === 'index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
            '<title>Todo App</title></head><body style="font-family:sans-serif;padding:2rem">' +
            '<h1>Todo App (DB) 서버 실행 중</h1>' +
            '<p>API 는 <code>GET /api/todos</code> 로 확인하세요.</p>' +
            '</body></html>'
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fileName).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// 라우팅
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // --- POST /api/auth/signup  (body: { username, password }) ---
    if (method === 'POST' && pathname === '/api/auth/signup') {
      const body = await readJsonBody(req);
      const username = (body.username || '').trim();
      const password = body.password || '';
      if (!username || !password) {
        return sendJson(res, 400, { error: '아이디와 비밀번호가 필요합니다.' });
      }
      if (password.length < 4) {
        return sendJson(res, 400, { error: '비밀번호는 4자 이상이어야 합니다.' });
      }
      try {
        const user = await signup(username, password);
        const token = issueToken(user);
        return sendJson(res, 201, { token, user: { id: Number(user.id), username: user.username } });
      } catch (err) {
        if (err.code === '23505') {
          return sendJson(res, 409, { error: '이미 존재하는 아이디입니다.' });
        }
        throw err;
      }
    }

    // --- POST /api/auth/login  (body: { username, password }) ---
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const username = (body.username || '').trim();
      const password = body.password || '';
      const user = await login(username, password);
      if (!user) return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      const token = issueToken(user);
      return sendJson(res, 200, { token, user: { id: Number(user.id), username: user.username } });
    }

    // --- /api/todos* 는 로그인 필요 ---
    if (pathname === '/api/todos' || /^\/api\/todos\//.test(pathname)) {
      const authUser = getAuthUser(req);
      if (!authUser) return sendJson(res, 401, { error: '로그인이 필요합니다.' });

      // --- POST /api/todos  (추가, body: { text }) ---
      if (method === 'POST' && pathname === '/api/todos') {
        const body = await readJsonBody(req);
        const text = (body.text || '').trim();
        if (!text) return sendJson(res, 400, { error: '할일 내용(text)이 필요합니다.' });
        const created = await createTodo(authUser.id, text);
        return sendJson(res, 201, { id: Number(created.id), text: created.text, done: created.done });
      }

      // --- DELETE /api/todos/:id ---
      const deleteMatch = pathname.match(/^\/api\/todos\/(\d+)$/);
      if (method === 'DELETE' && deleteMatch) {
        const id = parseInt(deleteMatch[1], 10);
        const ok = await deleteTodo(authUser.id, id);
        if (!ok) return sendJson(res, 404, { error: `id=${id} 할일을 찾을 수 없습니다.` });
        return sendJson(res, 200, { ok: true, id });
      }

      // --- GET /api/todos ---
      if (method === 'GET' && pathname === '/api/todos') {
        const todos = await getTodos(authUser.id);
        // id 를 숫자로 변환 (bigint → 문자열로 올 수 있음)
        return sendJson(
          res,
          200,
          todos.map((t) => ({ id: Number(t.id), text: t.text, done: t.done }))
        );
      }

      // --- POST /api/todos/:id/toggle ---
      const toggleMatch = pathname.match(/^\/api\/todos\/(\d+)\/toggle$/);
      if (method === 'POST' && toggleMatch) {
        const id = parseInt(toggleMatch[1], 10);
        const updated = await toggleTodo(authUser.id, id);
        if (!updated) return sendJson(res, 404, { error: `id=${id} 할일을 찾을 수 없습니다.` });
        return sendJson(res, 200, { id: Number(updated.id), text: updated.text, done: updated.done });
      }
    }

    // --- 정적: / 또는 /index.html ---
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return serveStatic(res, 'index.html');
    }

    // --- 기타 정적 파일 (디렉터리 탈출 방지) ---
    if (method === 'GET') {
      const safeName = path.basename(pathname);
      if (safeName && safeName !== '/' && fs.existsSync(path.join(ROOT, safeName))) {
        return serveStatic(res, safeName);
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error(`${method} ${pathname} 처리 실패:`, err.message);
    if (!res.headersSent) sendJson(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
});

// DB 초기화 후 서버 시작
initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Todo App (DB) 서버 실행 중: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패 — 서버를 시작하지 못했습니다:', err);
    process.exit(1);
  });
