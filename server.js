require('dotenv').config();
const express = require('express');
const app = express();
const PORT = 3000;
const swaggerUi = require('swagger-ui-express');
const openapiDocument = require('./openapi.json');
const db = require('./db');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json()); // parses incoming JSON request bodies

// Read
app.get('/tasks', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks').all();
  res.json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.json(task);
});

// Create
app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Title is required" });
  }

  const insert = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  const result = insert.run(title, 0);

  const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json(newTask);
});

// Update
app.put('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const { title, done } = req.body;

  if (title === undefined && done === undefined) {
    return res.status(400).json({ error: "Provide title and/or done to update" });
  }

  if (title !== undefined && title.trim() === "") {
    return res.status(400).json({ error: "Title cannot be empty" });
  }

  const updatedTitle = title !== undefined ? title : task.title;
  const updatedDone = done !== undefined ? (done ? 1 : 0) : task.done;

  db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?')
    .run(updatedTitle, updatedDone, id);

  const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json(updatedTask);
});

// Delete
app.delete('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.status(204).send();
});

// Swagger docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.listen(PORT, () => {
  console.log(`Server running and connected to Supabase on port ${PORT}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit();
});