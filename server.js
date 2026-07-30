require('dotenv').config();
const express = require('express');
const app = express();
const PORT = 3000;
const swaggerUi = require('swagger-ui-express');
const openapiDocument = require('./openapi.json');
console.log(openapiDocument.paths);
const db = require('./db');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const billingDb = require('./billing-db');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json()); // parses incoming JSON request bodies

// Middleware: verifies the bearer token, attaches the user to req.user
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access token required" });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = data.user;
  req.token = token;
  next();
}

// Auth: Sign Up
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json(data.user);
});

// Auth: Log In
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: "Invalid login credentials" });
  }

  res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user
  });
});

// Auth: Log Out (protected — must be logged in to log out)
app.post('/auth/logout', requireAuth, async (req, res) => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(204).send();
});

// Public route
app.get('/public/info', (req, res) => {
  res.status(200).json({ message: "Welcome stranger! This info is public." });
});

// Protected routes — using the shared middleware
app.get('/protected/profile', requireAuth, (req, res) => {
  res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    created_at: req.user.created_at
  });
});

app.get('/protected/dashboard', requireAuth, (req, res) => {
  res.status(200).json({ message: `Welcome to your dashboard, ${req.user.email}` });
});

// ===== Background Jobs =====

const jobs = new Map();
const MAX_ATTEMPTS = 3;

function createJob() {
  const id = crypto.randomUUID();
  const job = {
    id,
    status: "queued",
    result: null,
    error: null,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

function simulateSlowWork(job) {
  job.status = "processing";
  job.attempts += 1;

  setTimeout(() => {
    const shouldFail = Math.random() < 0.3;

    if (shouldFail) {
      if (job.attempts < MAX_ATTEMPTS) {
        console.log(`Job ${job.id} failed (attempt ${job.attempts}), retrying...`);
        simulateSlowWork(job);
      } else {
        job.status = "failed";
        job.error = `Failed after ${job.attempts} attempts`;
        console.error(`ALERT: Job ${job.id} permanently failed after ${MAX_ATTEMPTS} attempts`);
      }
    } else {
      job.status = "completed";
      job.result = { message: "Slow task finished", processedAt: new Date().toISOString() };
    }
  }, 5000);
}

app.post('/jobs/simulate', (req, res) => {
  const job = createJob();
  simulateSlowWork(job);

  res.status(202).json({
    id: job.id,
    status: job.status,
    message: "Job accepted, check status at /jobs/:id"
  });
});

app.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.status(200).json(job);
});

// ===== Usage Metering =====

app.post('/usage', (req, res) => {
  const { tenant_id, type, quantity, idempotency_key } = req.body;

  if (!tenant_id || !type || !quantity || !idempotency_key) {
    return res.status(400).json({
      error: "tenant_id, type, quantity, and idempotency_key are all required"
    });
  }

  if (type !== "api_call" && type !== "ai_token") {
    return res.status(400).json({ error: "type must be 'api_call' or 'ai_token'" });
  }

  const existing = billingDb
    .prepare('SELECT * FROM usage_events WHERE idempotency_key = ?')
    .get(idempotency_key);

  if (existing) {
    return res.status(200).json({ ...existing, deduplicated: true });
  }

  // Get the tenant and its plan
const tenant = billingDb.prepare(`
  SELECT
    t.id,
    p.api_call_limit,
    p.ai_token_limit
  FROM tenants t
  JOIN plans p ON t.plan_id = p.id
  WHERE t.id = ?
`).get(tenant_id);

if (!tenant) {
  return res.status(404).json({ error: "Tenant not found" });
}
// Calculate how much of this resource has already been used
const usage = billingDb.prepare(`
  SELECT COALESCE(SUM(quantity), 0) AS used
  FROM usage_events
  WHERE tenant_id = ?
  AND type = ?
`).get(tenant_id, type);

const limit =
  type === "api_call"
    ? tenant.api_call_limit
    : tenant.ai_token_limit;

    const projectedUsage = usage.used + quantity;

if (projectedUsage > limit) {
  return res.status(429).json({
    error: `${type} quota exceeded`,
    used: usage.used,
    limit,
    requested: quantity
  });
}

  const insert = billingDb.prepare(
    'INSERT INTO usage_events (tenant_id, type, quantity, idempotency_key) VALUES (?, ?, ?, ?)'
  );
  const result = insert.run(tenant_id, type, quantity, idempotency_key);

  const event = billingDb
    .prepare('SELECT * FROM usage_events WHERE id = ?')
    .get(result.lastInsertRowid);

  res.status(201).json(event);
});

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