const CATEGORY_META = [
  { key: 'food', label: '식비', color: 'var(--cat-food)' },
  { key: 'housing', label: '주거', color: 'var(--cat-housing)' },
  { key: 'transport', label: '교통', color: 'var(--cat-transport)' },
  { key: 'subscription', label: '구독료', color: 'var(--cat-subscription)' },
  { key: 'other', label: '기타', color: 'var(--cat-other)' },
];

function won(n) {
  return `${Number(n).toLocaleString('ko-KR')}만원`;
}

function readForm() {
  const years = Number(document.getElementById('years').value);
  const salary = Number(document.getElementById('salary').value);
  const categories = {};
  for (const { key } of CATEGORY_META) {
    categories[key] = Number(document.getElementById(`cat-${key}`).value);
  }
  return {
    job_role: document.getElementById('job-role').value,
    years_experience: years,
    monthly_salary: salary,
    categories,
  };
}

function validateClient(payload) {
  if (!Number.isInteger(payload.years_experience) || payload.years_experience < 0) return '연차를 입력하세요.';
  if (!Number.isInteger(payload.monthly_salary) || payload.monthly_salary <= 0) return '월급을 입력하세요.';
  for (const { key, label } of CATEGORY_META) {
    if (!Number.isInteger(payload.categories[key]) || payload.categories[key] < 0) return `${label} 지출을 입력하세요.`;
  }
  return null;
}

function renderHistogram(stats) {
  const hist = document.getElementById('hist');
  const labels = document.getElementById('hist-labels');
  const maxCount = Math.max(...stats.buckets.map((b) => b.count), 1);

  hist.innerHTML = stats.buckets.map((b, i) => {
    const isMe = i === stats.myBucketIndex;
    const heightPct = Math.max((b.count / maxCount) * 100, b.count > 0 ? 8 : 2);
    return `
      <div class="hist-col">
        ${isMe ? '<span class="hist-tag">나</span>' : b.count > 0 ? `<span class="hist-count">${b.count}</span>` : ''}
        <div class="hist-bar ${isMe ? 'me' : ''}" style="height:${heightPct}%"></div>
      </div>
    `;
  }).join('');

  labels.innerHTML = stats.buckets.map((b, i) =>
    `<span>${i === 0 ? b.from + '만' : b.from}</span>`
  ).join('');
}

function renderCategoryCompare(stats, myCategories) {
  const el = document.getElementById('cat-compare');
  el.innerHTML = CATEGORY_META.map(({ key, label, color }) => {
    const avg = stats.categoryAverages[key];
    const mine = myCategories[key];
    const max = Math.max(avg, mine, 1);
    const avgPct = Math.round((avg / max) * 100);
    const minePct = Math.round((mine / max) * 100);
    return `
      <div class="cat-row">
        <div class="cat-row-head">
          <span class="name"><span class="cat-dot" style="background:${color}"></span>${label}</span>
          <span class="nums">평균 ${won(avg)} · 나 <b>${won(mine)}</b></span>
        </div>
        <div class="cat-bars">
          <div class="cat-bar-track"><div class="cat-bar-fill avg" style="width:${avgPct}%"></div></div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${minePct}%;background:${color}"></div></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderResults(entry, stats) {
  document.getElementById('stat-total').textContent = `${stats.total.toLocaleString('ko-KR')}명`;
  document.getElementById('stat-percentile').textContent =
    stats.total < 2 ? '집계 중' : `상위 ${stats.topPercent}%`;
  document.getElementById('stat-avg-salary').textContent = won(stats.avgSalary);
  document.getElementById('stat-avg-expense').textContent = won(stats.avgExpense);

  renderHistogram(stats);
  renderCategoryCompare(stats, entry.categories);

  document.getElementById('form-view').classList.add('hidden');
  document.getElementById('results-view').classList.remove('hidden');
}

let _submitting = false;
async function submitEntry() {
  if (_submitting) return;
  const payload = readForm();
  const errorEl = document.getElementById('form-error');
  errorEl.classList.add('hidden');

  const clientError = validateClient(payload);
  if (clientError) {
    errorEl.textContent = clientError;
    errorEl.classList.remove('hidden');
    return;
  }

  _submitting = true;
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '제출 중...';

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || '제출에 실패했습니다.';
      errorEl.classList.remove('hidden');
      return;
    }
    renderResults(data.entry, data.stats);
  } catch (e) {
    errorEl.textContent = '서버에 연결할 수 없습니다.';
    errorEl.classList.remove('hidden');
  } finally {
    _submitting = false;
    btn.disabled = false;
    btn.textContent = '익명으로 제출하고 비교 결과 보기';
  }
}

function resetForm() {
  document.getElementById('results-view').classList.add('hidden');
  document.getElementById('form-view').classList.remove('hidden');
  document.getElementById('years').value = '';
  document.getElementById('salary').value = '';
  CATEGORY_META.forEach(({ key }) => { document.getElementById(`cat-${key}`).value = ''; });
}

document.getElementById('submit-btn').addEventListener('click', submitEntry);
document.getElementById('retry-btn').addEventListener('click', resetForm);
