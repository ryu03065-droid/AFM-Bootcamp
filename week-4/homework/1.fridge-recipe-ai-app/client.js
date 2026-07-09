const API = '';

// ── 재료 ─────────────────────────────────────────────

async function loadIngredients() {
  const res = await fetch(`${API}/api/ingredients`);
  const data = await res.json();
  const list = document.getElementById('ingredient-list');
  list.innerHTML = data.length === 0
    ? '<p class="empty">등록된 재료가 없습니다.</p>'
    : data.map(i => `
      <span class="tag">
        ${i.category ? `<em>${i.category}</em>` : ''}
        ${i.name}
        <button onclick="deleteIngredient('${i.id}')" title="삭제">×</button>
      </span>
    `).join('');
}

let _addingIngredient = false;
async function addIngredient() {
  if (_addingIngredient) return;
  _addingIngredient = true;
  setTimeout(() => { _addingIngredient = false; }, 500);

  const name = document.getElementById('ing-name').value.trim();
  const category = document.getElementById('ing-category').value.trim();
  if (!name) { _addingIngredient = false; return alert('재료 이름을 입력하세요.'); }
  await fetch(`${API}/api/ingredients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category }),
  });
  document.getElementById('ing-name').value = '';
  document.getElementById('ing-category').value = '';
  loadIngredients();
}

async function deleteIngredient(id) {
  await fetch(`${API}/api/ingredients/${id}`, { method: 'DELETE' });
  loadIngredients();
}

// 엔터로 재료 추가
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ing-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addIngredient(); }
  });
});

// ── 레시피 ────────────────────────────────────────────

async function loadRecipes() {
  const res = await fetch(`${API}/api/recipes`);
  const data = await res.json();
  const list = document.getElementById('recipe-list');
  list.innerHTML = data.length === 0
    ? '<p class="empty">저장된 레시피가 없습니다.</p>'
    : data.map(r => `
      <div class="card recipe-card">
        <div class="card-info">
          <span class="name">🍳 ${r.title}</span>
          ${r.ingredients ? `<p class="meta">재료: ${r.ingredients}</p>` : ''}
          ${r.steps ? `<p class="steps">${r.steps.replace(/\n/g, '<br>')}</p>` : ''}
        </div>
        <button class="btn-delete" onclick="deleteRecipe('${r.id}')">삭제</button>
      </div>
    `).join('');
}

async function addRecipe() {
  const title = document.getElementById('rec-title').value.trim();
  const ingredients = document.getElementById('rec-ingredients').value.trim();
  const steps = document.getElementById('rec-steps').value.trim();
  if (!title) return alert('레시피 이름을 입력하세요.');
  await fetch(`${API}/api/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, ingredients, steps }),
  });
  document.getElementById('rec-title').value = '';
  document.getElementById('rec-ingredients').value = '';
  document.getElementById('rec-steps').value = '';
  loadRecipes();
}

async function deleteRecipe(id) {
  await fetch(`${API}/api/recipes/${id}`, { method: 'DELETE' });
  loadRecipes();
}

// ── 탭 전환 ───────────────────────────────────────────

function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
}

// ── AI 레시피 생성 ────────────────────────────────────

let aiGeneratedRecipe = null;

async function generateRecipe() {
  const btn = document.getElementById('ai-gen-btn');
  const preview = document.getElementById('ai-preview');
  const style = document.getElementById('ai-style').value;

  btn.textContent = '⏳ AI가 레시피를 만들고 있어요...';
  btn.disabled = true;
  preview.style.display = 'none';

  try {
    const res = await fetch('/api/recipes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'AI 생성 실패'); return; }

    aiGeneratedRecipe = data;
    document.getElementById('ai-title').textContent = '🍳 ' + data.title;
    document.getElementById('ai-ingredients-text').textContent = '재료: ' + data.ingredients;
    document.getElementById('ai-steps-text').innerHTML = data.steps.replace(/\n/g, '<br>');
    document.getElementById('ai-time').textContent = '⏱ ' + (data.time || '?');
    document.getElementById('ai-difficulty').textContent = '📊 ' + (data.difficulty || '?');
    preview.style.display = 'block';
  } catch (e) {
    alert('오류: ' + e.message);
  } finally {
    btn.textContent = '🤖 AI 레시피 생성하기';
    btn.disabled = false;
  }
}

async function saveAiRecipe() {
  if (!aiGeneratedRecipe) return;
  const { title, ingredients, steps, time, difficulty } = aiGeneratedRecipe;
  const stepsWithMeta = steps + (time || difficulty ? `\n\n⏱ ${time || ''}  📊 ${difficulty || ''}` : '');
  await fetch('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, ingredients, steps: stepsWithMeta }),
  });
  document.getElementById('ai-preview').style.display = 'none';
  aiGeneratedRecipe = null;
  alert('레시피가 저장됐어요! 🎉');
  loadRecipes();
}

loadIngredients();
loadRecipes();
