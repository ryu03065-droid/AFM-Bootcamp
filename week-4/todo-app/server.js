const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function parseTxtFile(filePath, id) {
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  const title = raw.replace(/^\[[ x]\]\s*/, '');
  return { id, title, details: [], completed: false };
}

function getNextId() {
  let id = 1;
  while (fs.existsSync(path.join(__dirname, `todo_${id}.txt`))) {
    id++;
  }
  return id;
}

// Read all txt-based todos on every request
function readAllTodos() {
  const todos = [];
  let id = 1;
  while (true) {
    const filePath = path.join(__dirname, `todo_${id}.txt`);
    if (!fs.existsSync(filePath)) {
      // Keep scanning up to a gap of 1 to catch non-sequential files
      id++;
      if (id > 1000) break;
      // Stop after 3 consecutive missing files
      const next = path.join(__dirname, `todo_${id}.txt`);
      const next2 = path.join(__dirname, `todo_${id + 1}.txt`);
      if (!fs.existsSync(next) && !fs.existsSync(next2)) break;
      continue;
    }
    todos.push(parseTxtFile(filePath, id));
    id++;
  }
  return todos;
}

app.get('/api/todos', (_req, res) => {
  res.json(readAllTodos());
});

app.post('/api/todos', (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: '제목을 입력해 주세요' });
  }
  const id = getNextId();
  const filePath = path.join(__dirname, `todo_${id}.txt`);
  fs.writeFileSync(filePath, `[ ] ${title.trim()}\n`, 'utf-8');
  const newTodo = { id, title: title.trim(), details: [], completed: false };
  res.status(201).json(newTodo);
});

app.patch('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { completed } = req.body;
  const filePath = path.join(__dirname, `todo_${id}.txt`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: '해당 할 일을 찾을 수 없습니다' });
  }
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  const updated = raw.replace(/^\[[ x]\]/, completed ? '[x]' : '[ ]');
  fs.writeFileSync(filePath, updated + '\n', 'utf-8');
  res.json({ success: true });
});

app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const filePath = path.join(__dirname, `todo_${id}.txt`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: '해당 할 일을 찾을 수 없습니다' });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
