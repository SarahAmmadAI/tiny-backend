const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('billing.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    api_call_limit INTEGER NOT NULL,
    ai_token_limit INTEGER NOT NULL,
    price_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plan_id INTEGER NOT NULL DEFAULT 1,
    stripe_customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'incomplete',
    current_period_end TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );
`);

// Seed the two plans, only if empty
const planCount = db.prepare('SELECT COUNT(*) AS count FROM plans').get();
if (planCount.count === 0) {
  const insertPlan = db.prepare(
    'INSERT INTO plans (name, api_call_limit, ai_token_limit, price_cents) VALUES (?, ?, ?, ?)'
  );
  insertPlan.run('Free', 1000, 100000, 0);
  insertPlan.run('Pro', 100000, 5000000, 2900); // $29.00
}

module.exports = db;