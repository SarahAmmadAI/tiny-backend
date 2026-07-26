# Task API

A minimal CRUD API for managing tasks, built with Express.js, with SQLite persistence and Supabase authentication.

## Endpoints

| Method | Endpoint       | Description                  |
|--------|----------------|-------------------------------|
| GET    | `/`            | API info                     |
| GET    | `/status`      | Server status and time       |
| GET    | `/health`      | Health check                 |
| GET    | `/tasks`       | List all tasks               |
| GET    | `/tasks/:id`   | Get a single task by id      |
| POST   | `/tasks`       | Create a new task            |
| PUT    | `/tasks/:id`   | Update a task's title/done   |
| DELETE | `/tasks/:id`   | Delete a task                |

## How to run it

```bash
npm install
node server.js
```

Server starts at `http://localhost:3000`.

Interactive API docs (Swagger UI) are available at `http://localhost:3000/docs`.

## Example request

```bash
curl -i http://localhost:3000/tasks/1
```

Response:
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"id":1,"title":"Buy milk","done":false}
```

## Swagger UI

![Swagger UI screenshot](swagger-screenshot.png)

The full CRUD cycle (create, read, update, delete) can be tested directly from `/docs` using the "Try it out" button on each endpoint.

## Database

This project now uses SQLite instead of an in-memory array for storing tasks.

- **Why SQLite:** it requires no separate server or installation — the entire database lives in a single file, making it ideal for a small project like this. It's built into Node.js via the `node:sqlite` module, so no external native dependencies are needed.
- **Where the data lives:** `tasks.db`, in the project root. It's created automatically on first run if it doesn't exist.
- **How to start the project:**
```bash
  npm install
  node server.js
```
  The database and `tasks` table are created automatically, with 3 example tasks seeded only if the table is empty.

### Example SQL query

```sql
SELECT * FROM tasks WHERE done = 1;
```

Returns every task marked as completed.

### Database viewer

![DB Browser for SQLite screenshot](db-browser-screenshot.png)

Verified that changes made directly in the database (via DB Browser for SQLite) are immediately reflected through the API, confirming the API and database share the same underlying data.

## Authentication

This project uses Supabase Auth to manage user accounts and issue JWTs.

### Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Copy your Project URL and publishable (anon) key from **Project Settings → API**.
3. Copy `.env.example` to `.env` and fill in your own values:

```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_publishable_key
   PORT=3000
```
4. Run `npm install` then `node server.js`.

### Auth Endpoints

| Method | Endpoint              | Auth Required | Description                        |
|--------|------------------------|----------------|-------------------------------------|
| POST   | `/auth/signup`         | No             | Create a new user account          |
| POST   | `/auth/login`          | No             | Log in, returns access_token       |
| POST   | `/auth/logout`         | Yes (Bearer)   | Terminate the current session      |
| GET    | `/public/info`         | No             | Public, unprotected data           |
| GET    | `/protected/profile`   | Yes (Bearer)   | Read the logged-in user's profile  |
| GET    | `/protected/dashboard` | Yes (Bearer)   | Example second protected route     |

Protected routes require a header: `Authorization: Bearer <your_access_token>`. Get a token by calling `/auth/login`.

### Swagger UI

Visit `/docs` and click **Authorize** to paste your token — all protected routes will then work directly through "Try it out."

![Swagger UI with bearer auth](swagger-auth-screenshot.png)