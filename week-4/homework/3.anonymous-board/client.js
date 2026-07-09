let selectedCategory = '고민';
let currentSort = 'latest';

function getMyTokens() {
  return JSON.parse(localStorage.getItem('myPostTokens') || '{}');
}
function saveMyToken(id, token) {
  const tokens = getMyTokens();
  tokens[id] = token;
  localStorage.setItem('myPostTokens', JSON.stringify(tokens));
}
function removeMyToken(id) {
  const tokens = getMyTokens();
  delete tokens[id];
  localStorage.setItem('myPostTokens', JSON.stringify(tokens));
}

document.getElementById('cat-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  selectedCategory = btn.dataset.cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b === btn));
});

function setSort(sort) {
  currentSort = sort;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === sort));
  loadPosts();
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

async function loadPosts() {
  const list = document.getElementById('post-list');
  const res = await fetch(`/api/posts?sort=${currentSort}`);
  const posts = await res.json();
  const myTokens = getMyTokens();

  list.innerHTML = posts.length === 0
    ? '<p class="empty">아직 등록된 글이 없어요. 첫 글을 남겨보세요 🌙</p>'
    : posts.map(p => `
      <div class="post-card">
        <div class="post-top">
          <span class="tag" data-cat="${p.category}">${p.category}</span>
          <span class="post-time">${timeAgo(p.created_at)}</span>
        </div>
        <p class="post-content">${escapeHtml(p.content)}</p>
        <div class="post-actions">
          <button class="like-btn" onclick="likePost(${p.id})">❤️ 공감 ${p.likes}</button>
          ${myTokens[p.id] ? `<button class="delete-btn" onclick="deletePost(${p.id})">삭제</button>` : ''}
        </div>
      </div>
    `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let _submitting = false;
async function submitPost() {
  if (_submitting) return;
  const textarea = document.getElementById('post-content');
  const content = textarea.value.trim();
  if (!content) return alert('내용을 입력하세요.');

  _submitting = true;
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category: selectedCategory }),
    });
    const post = await res.json();
    if (res.ok) saveMyToken(post.id, post.owner_token);
    textarea.value = '';
    loadPosts();
  } finally {
    _submitting = false;
    btn.disabled = false;
  }
}

async function likePost(id) {
  await fetch(`/api/posts/${id}/like`, { method: 'POST' });
  loadPosts();
}

async function deletePost(id) {
  const myTokens = getMyTokens();
  const owner_token = myTokens[id];
  if (!owner_token) return;
  const res = await fetch(`/api/posts/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_token }),
  });
  if (res.ok) removeMyToken(id);
  loadPosts();
}

loadPosts();
