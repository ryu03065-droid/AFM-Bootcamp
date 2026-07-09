const POLL_INTERVAL = 3000;

function getVoterToken() {
  let token = localStorage.getItem('balanceVoterToken');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('balanceVoterToken', token);
  }
  return token;
}
function getMyVotes() {
  return JSON.parse(localStorage.getItem('balanceMyVotes') || '{}');
}
function saveMyVote(id, choice) {
  const votes = getMyVotes();
  votes[id] = choice;
  localStorage.setItem('balanceMyVotes', JSON.stringify(votes));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderQuestion(q) {
  const myChoice = getMyVotes()[q.id];

  return `
    <div class="vs-card" data-id="${q.id}">
      <div class="vs-bar">
        <button class="vs-side side-a ${myChoice === 'a' ? 'picked' : ''}" style="flex-basis:${q.pct_a}%" onclick="vote(${q.id}, 'a')">
          <span class="side-label">${escapeHtml(q.option_a)}</span>
          <span class="side-pct">${q.pct_a}%</span>
        </button>
        <button class="vs-side side-b ${myChoice === 'b' ? 'picked' : ''}" style="flex-basis:${q.pct_b}%" onclick="vote(${q.id}, 'b')">
          <span class="side-label">${escapeHtml(q.option_b)}</span>
          <span class="side-pct">${q.pct_b}%</span>
        </button>
      </div>
      <div class="vs-foot">
        <span>👥 총 ${q.total}명 참여</span>
        ${myChoice ? '<span class="voted-badge">✓ 투표 완료 (다시 눌러 변경)</span>' : '<span class="cta">눌러서 투표하기</span>'}
      </div>
    </div>
  `;
}

async function loadQuestions() {
  const list = document.getElementById('question-list');
  const res = await fetch('/api/questions');
  const questions = await res.json();

  list.innerHTML = questions.length === 0
    ? '<p class="empty">아직 등록된 밸런스 게임이 없어요. 첫 대결을 만들어보세요 ⚔️</p>'
    : questions.map(renderQuestion).join('');
}

async function vote(id, choice) {
  const voter_token = getVoterToken();
  await fetch(`/api/questions/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choice, voter_token }),
  });
  saveMyVote(id, choice);
  loadQuestions();
}

let _submitting = false;
async function submitQuestion() {
  if (_submitting) return;
  const inputA = document.getElementById('option-a');
  const inputB = document.getElementById('option-b');
  const option_a = inputA.value.trim();
  const option_b = inputB.value.trim();
  if (!option_a || !option_b) return alert('두 가지 선택지를 모두 입력하세요.');

  _submitting = true;
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option_a, option_b }),
    });
    if (res.ok) {
      inputA.value = '';
      inputB.value = '';
      loadQuestions();
    }
  } finally {
    _submitting = false;
    btn.disabled = false;
  }
}

loadQuestions();
setInterval(loadQuestions, POLL_INTERVAL);
