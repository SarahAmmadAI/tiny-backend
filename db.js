const { DatabaseSync } = require('node:sqlite');

// Creates tasks.db in this folder if it doesn't already exist
const db = new DatabaseSync('tasks.db');

// Create the table if it doesn't already exist
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`);

// Only insert example tasks if the table is currently empty
const countRow = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();

if (countRow.count === 0) {
  const insert = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  insert.run('Buy milk', 0);
  insert.run('Walk the dog', 0);
  insert.run('Finish assignment', 0);
}

module.exports = db;