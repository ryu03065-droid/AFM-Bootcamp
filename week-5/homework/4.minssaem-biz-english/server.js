require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET 환경변수가 필요합니다.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '30d';

// ── 토스페이먼츠 ──────────────────────────────────────
// 시크릿 키는 서버에서만 사용한다. 결제 승인 API 인증 헤더는 "시크릿키:" 을 Base64 인코딩.
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
if (!TOSS_SECRET_KEY) {
  console.error('TOSS_SECRET_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';
const tossAuthHeader = 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');

// 금액 위변조 방지: 강의 가격 원본(프론트 COURSES.salePrice)을 서버에도 동일하게 둔다.
// 결제 금액은 항상 이 표를 기준으로 서버가 재계산하며, 클라이언트가 보낸 금액은 신뢰하지 않는다.
const COURSE_PRICES = {
  track1: 100, // TEST-100: 토스페이먼츠 100원 결제 테스트용 임시 가격
  track2: 279000,
  coaching: 890000,
};
const COURSE_NAMES = {
  track1: '기본기 쌓는 비즈니스 영어',
  track2: '말하는 비즈니스 영어',
  coaching: '1:1 Executive 비즈니스 영어 코칭',
};

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

// 강의 콘텐츠(제목/커리큘럼/가격 등)는 프론트엔드 COURSES 배열이 원본이다.
// DB는 "이 유저가 어떤 course_id 를 장바구니/수강중에 담았는지"만 저장한다.
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS minssaem_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS minssaem_cart (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES minssaem_users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, course_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS minssaem_enrollments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES minssaem_users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, course_id)
    )
  `);
  // 결제 주문: 결제 요청 전 서버가 미리 생성한다.
  // amount(서버가 재계산한 예상 금액)와 course_ids(대상 강의)를 저장해두고,
  // 승인(confirm) 시 이 값과 대조해 위변조를 막는다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS minssaem_orders (
      order_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES minssaem_users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      course_ids TEXT[] NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      payment_key TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      paid_at TIMESTAMP
    )
  `);
}

// ── 인증 헬퍼 ─────────────────────────────────────────

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function getAuthUser(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    return { id: payload.sub, username: payload.username };
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.authUser = authUser;
  next();
}

function publicUser(row) {
  return { id: row.id, username: row.username, nickname: row.nickname };
}

// ── 회원가입 / 로그인 / 내 정보 ───────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const nickname = (req.body.nickname || '').trim() || username;
  if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호가 필요합니다.' });
  if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO minssaem_users (username, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, username, nickname',
      [username, passwordHash, nickname]
    );
    const user = rows[0];
    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '이미 존재하는 아이디입니다.' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  try {
    const { rows } = await pool.query('SELECT * FROM minssaem_users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM minssaem_users WHERE id = $1', [req.authUser.id]);
    if (!rows[0]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(publicUser(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 장바구니 API (로그인 필요) — course_id 문자열 배열로 주고받는다 ──

async function fetchIds(table, userId) {
  const { rows } = await pool.query(
    `SELECT course_id FROM ${table} WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  return rows.map((r) => r.course_id);
}

app.get('/api/cart', requireAuth, async (req, res) => {
  try {
    res.json(await fetchIds('minssaem_cart', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cart', requireAuth, async (req, res) => {
  const courseId = (req.body.course_id || '').trim();
  if (!courseId) return res.status(400).json({ error: '강의가 필요합니다.' });
  try {
    await pool.query(
      'INSERT INTO minssaem_cart (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING',
      [req.authUser.id, courseId]
    );
    res.status(201).json(await fetchIds('minssaem_cart', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cart/:courseId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM minssaem_cart WHERE user_id = $1 AND course_id = $2',
      [req.authUser.id, req.params.courseId]
    );
    res.json(await fetchIds('minssaem_cart', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cart', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM minssaem_cart WHERE user_id = $1', [req.authUser.id]);
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 토스페이먼츠 결제 ──────────────────────────────────
// 흐름: prepare(주문 사전 생성) → 프론트가 위젯으로 결제창 호출 →
//       성공 리다이렉트 → confirm(서버가 시크릿 키로 승인 검증) → 승인 성공 시에만 수강 등록.

// 서버 기준으로 강의 금액 합계를 재계산한다. (알 수 없는 course_id 는 거부)
function calcAmount(courseIds) {
  let total = 0;
  for (const id of courseIds) {
    const price = COURSE_PRICES[id];
    if (price == null) return null; // 가격표에 없는 강의 → 위변조/데이터 불일치
    total += price;
  }
  return total;
}

function buildOrderName(courseIds) {
  const names = courseIds.map((id) => COURSE_NAMES[id] || id);
  if (names.length === 0) return '민쌤 비즈니스 영어';
  return names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}건`;
}

// 장바구니의 강의를 수강중으로 옮기고 장바구니에서 제거한다. (승인 성공 후에만 호출)
async function enrollCourses(userId, courseIds) {
  for (const courseId of courseIds) {
    await pool.query(
      'INSERT INTO minssaem_enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING',
      [userId, courseId]
    );
    await pool.query('DELETE FROM minssaem_cart WHERE user_id = $1 AND course_id = $2', [userId, courseId]);
  }
}

// 1) 결제 요청 전 주문을 미리 생성한다. 금액은 서버가 장바구니 기준으로 재계산한다.
app.post('/api/payments/prepare', requireAuth, async (req, res) => {
  try {
    const cartIds = await fetchIds('minssaem_cart', req.authUser.id);
    if (cartIds.length === 0) return res.status(400).json({ error: '장바구니가 비어 있습니다.' });

    const amount = calcAmount(cartIds);
    if (amount == null) return res.status(400).json({ error: '주문할 수 없는 강의가 포함되어 있습니다.' });

    // 고유하고 예측 불가능한 orderId (토스 권장: 6~64자, 영문/숫자/-/_ )
    const orderId = `minssaem_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const orderName = buildOrderName(cartIds);

    await pool.query(
      `INSERT INTO minssaem_orders (order_id, user_id, amount, course_ids, status)
       VALUES ($1, $2, $3, $4, 'PENDING')`,
      [orderId, req.authUser.id, amount, cartIds]
    );

    res.json({ orderId, amount, orderName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2) 결제 승인. 성공 리다이렉트 후 프론트가 paymentKey/orderId/amount 를 보낸다.
//    서버는 저장해둔 주문 금액과 대조하고, 시크릿 키로 토스 승인 API 를 호출한다.
//    승인이 실제로 성공했을 때만 수강 등록한다.
app.post('/api/payments/confirm', requireAuth, async (req, res) => {
  const { paymentKey, orderId } = req.body;
  const clientAmount = Number(req.body.amount);
  if (!paymentKey || !orderId) return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM minssaem_orders WHERE order_id = $1 AND user_id = $2',
      [orderId, req.authUser.id]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });

    // 이미 승인된 주문이면 재승인하지 않고 현재 수강 목록만 반환 (새로고침 대비 멱등 처리)
    if (order.status === 'PAID') {
      return res.json({ alreadyProcessed: true, myCourses: await fetchIds('minssaem_enrollments', req.authUser.id) });
    }

    // 위변조 방지: 저장된 금액을 신뢰하고, 서버가 강의로 재계산한 값과도 재확인한다.
    const expectedAmount = calcAmount(order.course_ids);
    if (expectedAmount == null || expectedAmount !== order.amount) {
      await pool.query("UPDATE minssaem_orders SET status = 'FAILED' WHERE order_id = $1", [orderId]);
      return res.status(400).json({ error: '주문 금액을 확인할 수 없습니다.' });
    }
    // 리다이렉트로 돌아온 금액이 저장 금액과 다르면 위변조로 간주한다.
    if (clientAmount !== order.amount) {
      await pool.query("UPDATE minssaem_orders SET status = 'FAILED' WHERE order_id = $1", [orderId]);
      return res.status(400).json({ error: '결제 금액이 일치하지 않습니다.' });
    }

    // 토스 승인 API 호출 — 금액은 항상 서버가 저장한 값(order.amount)을 사용한다.
    const tossRes = await fetch(TOSS_CONFIRM_URL, {
      method: 'POST',
      headers: { Authorization: tossAuthHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
    });
    const payment = await tossRes.json();

    if (!tossRes.ok) {
      await pool.query("UPDATE minssaem_orders SET status = 'FAILED' WHERE order_id = $1", [orderId]);
      // 토스가 준 에러 코드/메시지를 그대로 전달
      return res.status(400).json({ error: payment.message || '결제 승인에 실패했습니다.', code: payment.code });
    }

    // 승인 성공 → 수강 등록 및 주문 완료 처리
    await enrollCourses(req.authUser.id, order.course_ids);
    await pool.query(
      "UPDATE minssaem_orders SET status = 'PAID', payment_key = $1, paid_at = NOW() WHERE order_id = $2",
      [paymentKey, orderId]
    );

    res.json({
      myCourses: await fetchIds('minssaem_enrollments', req.authUser.id),
      orderName: buildOrderName(order.course_ids),
      amount: order.amount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/my-courses', requireAuth, async (req, res) => {
  try {
    res.json(await fetchIds('minssaem_enrollments', req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
init().then(() => {
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
}).catch(e => {
  console.error('DB 초기화 실패:', e.message);
  process.exit(1);
});
