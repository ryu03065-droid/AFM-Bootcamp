require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET 환경변수가 필요합니다.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '7d';

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

const SEED_PRODUCTS = [
  { name: '오버사이즈 후드 집업', description: '겨울에도 봄에도 걸치기 좋은 기본 후드 집업.', price: 39000, category: '의류', image_seed: 'hoodie-01', stock: 40 },
  { name: '스트레이트 데님 팬츠', description: '어떤 상의와도 잘 어울리는 스트레이트 핏 데님.', price: 45000, category: '의류', image_seed: 'denim-02', stock: 35 },
  { name: '니트 가디건', description: '얇고 부드러운 소재로 환절기에 딱 좋은 가디건.', price: 42000, category: '의류', image_seed: 'knit-03', stock: 28 },
  { name: '청키 스니커즈', description: '어떤 코디에도 포인트가 되는 볼륨감 있는 스니커즈.', price: 68000, category: '신발', image_seed: 'sneaker-04', stock: 22 },
  { name: '크로스백', description: '가볍게 메기 좋은 데일리 크로스백.', price: 52000, category: '잡화', image_seed: 'bag-05', stock: 18 },
  { name: '무선 이어버드', description: '노이즈 캔슬링을 지원하는 가벼운 무선 이어폰.', price: 89000, category: '전자기기', image_seed: 'earbuds-06', stock: 50 },
  { name: '블루투스 키보드', description: '얇고 조용한 타건감의 슬림 블루투스 키보드.', price: 55000, category: '전자기기', image_seed: 'keyboard-07', stock: 30 },
  { name: '미니 가습기', description: '책상 위에 두기 좋은 소용량 초음파 가습기.', price: 32000, category: '생활가전', image_seed: 'humidifier-08', stock: 45 },
  { name: '무드등', description: '은은한 조명으로 방 분위기를 바꿔주는 무드등.', price: 19000, category: '생활용품', image_seed: 'lamp-09', stock: 60 },
  { name: '텀블러 500ml', description: '보온·보냉 12시간, 매일 들고 다니기 좋은 텀블러.', price: 15000, category: '생활용품', image_seed: 'tumbler-10', stock: 80 },
];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_app_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_app_products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '기타',
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_app_cart_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES shop_app_users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES shop_app_products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, product_id)
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM shop_app_products');
  if (rows[0].count === 0) {
    for (const p of SEED_PRODUCTS) {
      const imageUrl = `https://picsum.photos/seed/${p.image_seed}/480/480`;
      await pool.query(
        `INSERT INTO shop_app_products (name, description, price, image_url, category, stock)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.name, p.description, p.price, imageUrl, p.category, p.stock]
      );
    }
    console.log(`상품 시드 데이터 ${SEED_PRODUCTS.length}건 등록 완료`);
  }
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
      'INSERT INTO shop_app_users (username, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, username, nickname',
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
    const { rows } = await pool.query('SELECT * FROM shop_app_users WHERE username = $1', [username]);
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
    const { rows } = await pool.query('SELECT * FROM shop_app_users WHERE id = $1', [req.authUser.id]);
    if (!rows[0]) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(publicUser(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 상품 API (공개) ───────────────────────────────────

app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, description, price, image_url, category, stock FROM shop_app_products ORDER BY id ASC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, description, price, image_url, category, stock FROM shop_app_products WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 장바구니 API (로그인 필요) ────────────────────────

async function fetchCart(userId) {
  const { rows } = await pool.query(
    `SELECT
       c.id, c.quantity,
       p.id AS product_id, p.name, p.price, p.image_url, p.category, p.stock
     FROM shop_app_cart_items c
     JOIN shop_app_products p ON p.id = c.product_id
     WHERE c.user_id = $1
     ORDER BY c.created_at ASC`,
    [userId]
  );
  return rows;
}

app.get('/api/cart', requireAuth, async (req, res) => {
  try {
    res.json(await fetchCart(req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cart', requireAuth, async (req, res) => {
  const productId = req.body.product_id;
  const quantity = Number.isInteger(req.body.quantity) && req.body.quantity > 0 ? req.body.quantity : 1;
  if (!productId) return res.status(400).json({ error: '상품이 필요합니다.' });
  try {
    const { rows: productRows } = await pool.query('SELECT stock FROM shop_app_products WHERE id = $1', [productId]);
    if (!productRows[0]) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });

    const { rows: existingRows } = await pool.query(
      'SELECT id, quantity FROM shop_app_cart_items WHERE user_id = $1 AND product_id = $2',
      [req.authUser.id, productId]
    );
    const nextQuantity = (existingRows[0]?.quantity || 0) + quantity;
    if (nextQuantity > productRows[0].stock) {
      return res.status(400).json({ error: `재고가 부족합니다. (재고: ${productRows[0].stock}개)` });
    }

    if (existingRows[0]) {
      await pool.query('UPDATE shop_app_cart_items SET quantity = $1 WHERE id = $2', [nextQuantity, existingRows[0].id]);
    } else {
      await pool.query(
        'INSERT INTO shop_app_cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)',
        [req.authUser.id, productId, quantity]
      );
    }
    res.status(201).json(await fetchCart(req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/cart/:id', requireAuth, async (req, res) => {
  const quantity = req.body.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: '수량은 1 이상의 정수여야 합니다.' });
  }
  try {
    const { rows: itemRows } = await pool.query(
      `SELECT c.id, p.stock FROM shop_app_cart_items c
       JOIN shop_app_products p ON p.id = c.product_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [req.params.id, req.authUser.id]
    );
    if (!itemRows[0]) return res.status(404).json({ error: '장바구니 항목을 찾을 수 없습니다.' });
    if (quantity > itemRows[0].stock) {
      return res.status(400).json({ error: `재고가 부족합니다. (재고: ${itemRows[0].stock}개)` });
    }
    await pool.query('UPDATE shop_app_cart_items SET quantity = $1 WHERE id = $2', [quantity, req.params.id]);
    res.json(await fetchCart(req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cart/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM shop_app_cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.authUser.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '장바구니 항목을 찾을 수 없습니다.' });
    res.json(await fetchCart(req.authUser.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cart', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM shop_app_cart_items WHERE user_id = $1', [req.authUser.id]);
    res.json([]);
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
