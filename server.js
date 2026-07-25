const express = require('express');
const app = express();
const PORT = 3000;
const swaggerUi = require('swagger-ui-express');
const openapiDocument = require('./openapi.json');

app.use(express.json()); // parses incoming JSON request bodies

// In-memory "database"
let tasks = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Walk the dog", done: false },
  { id: 3, title: "Finish assignment", done: true }
];

let nextId = 4;

app.get('/', (req, res) => {
  res.json({ name: "Task API", version: "1.0", endpoints: ["/tasks"] });
});

app.get('/status', (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// Read
app.get('/tasks', (req, res) => {
  res.json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const task = tasks.find(t => t.id === id);

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

  const newTask = { id: nextId++, title, done: false };
  tasks.push(newTask);

  res.status(201).json(newTask);
});

// Update
app.put('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const task = tasks.find(t => t.id === id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const { title, done } = req.body;

  if (title === undefined && done === undefined) {
    return res.status(400).json({ error: "Provide title and/or done to update" });
  }

  if (title !== undefined) {
    if (title.trim() === "") {
      return res.status(400).json({ error: "Title cannot be empty" });
    }
    task.title = title;
  }

  if (done !== undefined) {
    task.done = done;
  }

  res.json(task);
});

// Delete
app.delete('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = tasks.findIndex(t => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  tasks.splice(index, 1);
  res.status(204).send();
});

// Swagger docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});