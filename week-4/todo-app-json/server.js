const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const DB_PATH = path.join(__dirname, 'todos.json');

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/todos', (_req, res) => {
  const { todos } = readDB();
  res.json(todos);
});

app.post('/api/todos', (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: '제목을 입력해 주세요' });
  }
  const db = readDB();
  const newTodo = { id: db.nextId++, title: title.trim(), completed: false };
  db.todos.push(newTodo);
  writeDB(db);
  res.status(201).json(newTodo);
});

app.patch('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { completed } = req.body;
  const db = readDB();
  const todo = db.todos.find((t) => t.id === id);
  if (!todo) {
    return res.status(404).json({ success: false, message: '해당 할 일을 찾을 수 없습니다' });
  }
  todo.completed = completed;
  writeDB(db);
  res.json({ success: true });
});

app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = readDB();
  const index = db.todos.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: '해당 할 일을 찾을 수 없습니다' });
  }
  db.todos.splice(index, 1);
  writeDB(db);
  res.json({ success: true });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
