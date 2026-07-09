require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3010;

// --- Database pool (Supabase Postgres, shared bootcamp DB) ---
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Helpers ---
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, message, status = 500) => res.status(status).json({ success: false, message });

// =====================================================================
// INGREDIENTS
// =====================================================================

// List all ingredients (oldest first)
app.get('/api/ingredients', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, category, qty, unit, expiry, created_at FROM ingredients ORDER BY created_at ASC'
    );
    ok(res, rows);
  } catch (err) {
    console.error('GET /api/ingredients', err);
    fail(res, 'Failed to fetch ingredients');
  }
});

// Create one ingredient
app.post('/api/ingredients', async (req, res) => {
  const { name, category, qty, unit, expiry } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, 'name is required', 400);
  try {
    const { rows } = await pool.query(
      `INSERT INTO ingredients (name, category, qty, unit, expiry)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, category, qty, unit, expiry, created_at`,
      [name, category ?? null, qty ?? null, unit ?? null, expiry || null]
    );
    ok(res, rows[0], 201);
  } catch (err) {
    console.error('POST /api/ingredients', err);
    fail(res, 'Failed to create ingredient');
  }
});

// Update one ingredient
app.put('/api/ingredients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, category, qty, unit, expiry } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, 'name is required', 400);
  try {
    const { rows } = await pool.query(
      `UPDATE ingredients
         SET name = $1, category = $2, qty = $3, unit = $4, expiry = $5
       WHERE id = $6
       RETURNING id, name, category, qty, unit, expiry, created_at`,
      [name, category ?? null, qty ?? null, unit ?? null, expiry || null, id]
    );
    if (rows.length === 0) return fail(res, 'Ingredient not found', 404);
    ok(res, rows[0]);
  } catch (err) {
    console.error('PUT /api/ingredients/:id', err);
    fail(res, 'Failed to update ingredient');
  }
});

// Delete one ingredient
app.delete('/api/ingredients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'DELETE FROM ingredients WHERE id = $1 RETURNING id',
      [id]
    );
    if (rows.length === 0) return fail(res, 'Ingredient not found', 404);
    ok(res, { id: rows[0].id });
  } catch (err) {
    console.error('DELETE /api/ingredients/:id', err);
    fail(res, 'Failed to delete ingredient');
  }
});

// =====================================================================
// RECIPES
// =====================================================================

// List all recipes (oldest first)
app.get('/api/recipes', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, ingredients, steps, created_at FROM recipes ORDER BY created_at ASC'
    );
    ok(res, rows);
  } catch (err) {
    console.error('GET /api/recipes', err);
    fail(res, 'Failed to fetch recipes');
  }
});

// Create one recipe
app.post('/api/recipes', async (req, res) => {
  const { title, ingredients, steps } = req.body || {};
  if (!title || !String(title).trim()) return fail(res, 'title is required', 400);
  try {
    const { rows } = await pool.query(
      `INSERT INTO recipes (title, ingredients, steps)
       VALUES ($1, $2, $3)
       RETURNING id, title, ingredients, steps, created_at`,
      [title, ingredients ?? null, steps ?? null]
    );
    ok(res, rows[0], 201);
  } catch (err) {
    console.error('POST /api/recipes', err);
    fail(res, 'Failed to create recipe');
  }
});

// Update one recipe
app.put('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, ingredients, steps } = req.body || {};
  if (!title || !String(title).trim()) return fail(res, 'title is required', 400);
  try {
    const { rows } = await pool.query(
      `UPDATE recipes
         SET title = $1, ingredients = $2, steps = $3
       WHERE id = $4
       RETURNING id, title, ingredients, steps, created_at`,
      [title, ingredients ?? null, steps ?? null, id]
    );
    if (rows.length === 0) return fail(res, 'Recipe not found', 404);
    ok(res, rows[0]);
  } catch (err) {
    console.error('PUT /api/recipes/:id', err);
    fail(res, 'Failed to update recipe');
  }
});

// Delete one recipe
app.delete('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'DELETE FROM recipes WHERE id = $1 RETURNING id',
      [id]
    );
    if (rows.length === 0) return fail(res, 'Recipe not found', 404);
    ok(res, { id: rows[0].id });
  } catch (err) {
    console.error('DELETE /api/recipes/:id', err);
    fail(res, 'Failed to delete recipe');
  }
});

// --- Error handler (last resort) ---
app.use((err, _req, res, _next) => {
  console.error('Unhandled error', err);
  fail(res, 'Internal server error');
});

// --- Startup ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
