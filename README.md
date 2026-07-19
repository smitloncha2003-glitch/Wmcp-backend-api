# WeaponMC Control Panel Pro — Backend

Production-ready Node.js backend that bridges your **WMCP-Pro Paper plugin** with the **Netlify dashboard** at `https://weaponmcpanel.netlify.app`.

```
Paper Plugin  →  WMCP Backend API  →  Netlify Dashboard
```

---

## Quick Start

```bash
cd wmcp-backend
npm install
cp .env.example .env          # fill in your secrets
node server.js
```

The server starts on port `3001` (or whatever `PORT` is set to) and automatically creates the SQLite database at `./data/wmcp.db`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in every value before running.

| Variable             | Description                                                       |
|----------------------|-------------------------------------------------------------------|
| `PORT`               | HTTP port (default: `3001`)                                       |
| `JWT_SECRET`         | Secret for signing access tokens (15 min expiry)                  |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (7 day expiry)                  |
| `PLUGIN_API_KEY`     | API key shared between this server and your plugin's `config.yml` |
| `OPENAI_API_KEY`     | OpenAI API key — never exposed to the frontend                    |
| `DATABASE_PATH`      | Path to the SQLite file (default: `./data/wmcp.db`)               |
| `LOG_LEVEL`          | Winston log level: `error`, `warn`, `info`, `http`, `debug`       |
| `CORS_ORIGIN`        | Allowed CORS origin — set to your Netlify URL in production       |

Generate strong JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Folder Structure

```
wmcp-backend/
├── server.js              # Entry point — Express + HTTP + WebSocket
├── config/
│   └── index.js           # Centralised config loaded from env
├── database/
│   ├── index.js           # SQLite init, getDb(), closeDatabase()
│   └── schema.js          # CREATE TABLE statements
├── routes/
│   ├── auth.js            # /api/auth/*  — login codes, JWT, refresh, logout
│   ├── plugin.js          # /api/plugin/* — Plugin API key routes
│   ├── dashboard.js       # /api/*       — Dashboard JWT routes
│   └── ai.js              # /api/ai/*    — OpenAI chat
├── middleware/
│   ├── auth.js            # requireAuth / requireOwner JWT middleware
│   ├── pluginAuth.js      # requirePluginAuth API key middleware
│   ├── errorHandler.js    # Central error handler + 404 catch-all
│   └── rateLimiter.js     # Per-route rate limiters
├── services/
│   ├── authService.js     # Token generation, login codes, sessions, audit
│   ├── aiService.js       # OpenAI chat wrapper
│   └── broadcastService.js# Broadcast to WebSocket dashboard clients
├── websocket/
│   └── handler.js         # WS server, auth upgrade, snapshot, message relay
├── utils/
│   ├── logger.js          # Winston logger → logs/server.log + logs/error.log
│   └── crypto.js          # 6-digit code generator, timing-safe compare
├── logs/                  # Auto-created on first run
│   ├── server.log
│   └── error.log
├── data/                  # Auto-created on first run
│   └── wmcp.db
├── .env.example
└── package.json
```

---

## Authentication Flow

### Dashboard Login (One-Time Code)

1. **Generate a code**
   ```http
   POST /api/auth/login-code
   ```
   Returns a 6-digit code. In production, read it from `logs/server.log`.

2. **Exchange code for tokens**
   ```http
   POST /api/auth/login
   Content-Type: application/json

   { "code": "123456" }
   ```
   Returns `accessToken` (15 min) and `refreshToken` (7 days).

3. **Use the access token**
   ```http
   GET /api/status
   Authorization: Bearer <accessToken>
   ```

4. **Refresh when the access token expires**
   ```http
   POST /api/auth/refresh
   Content-Type: application/json

   { "refreshToken": "<refreshToken>" }
   ```

5. **Logout**
   ```http
   POST /api/auth/logout
   Authorization: Bearer <accessToken>

   { "refreshToken": "<refreshToken>" }
   ```

---

## Plugin API

All plugin routes use `X-API-Key` header authentication:

```
X-API-Key: <your PLUGIN_API_KEY>
```

| Method | Path                      | Description                    |
|--------|---------------------------|--------------------------------|
| POST   | `/api/plugin/register`    | Plugin startup announcement    |
| POST   | `/api/plugin/heartbeat`   | Keepalive with uptime          |
| POST   | `/api/plugin/status`      | Full server status snapshot    |
| POST   | `/api/plugin/performance` | TPS, MSPT, CPU, RAM metrics    |
| POST   | `/api/plugin/players`     | Replace current player list    |
| POST   | `/api/plugin/worlds`      | Replace current world list     |
| POST   | `/api/plugin/plugins`     | Replace current plugin list    |

### Example: performance payload
```json
{
  "tps": 19.8,
  "mspt": 12.4,
  "cpuUsage": 34.2,
  "ramUsed": 2048000000,
  "ramTotal": 8192000000
}
```

---

## Dashboard API

All dashboard routes require `Authorization: Bearer <accessToken>`.

| Method | Path              | Description                                     |
|--------|-------------------|-------------------------------------------------|
| GET    | `/api/status`     | Current server status                           |
| GET    | `/api/performance`| Latest metrics + 60-point history               |
| GET    | `/api/players`    | Online player list                              |
| GET    | `/api/worlds`     | World list                                      |
| GET    | `/api/plugins`    | Plugin list                                     |
| GET    | `/api/console`    | Console log history (`?limit=100&level=WARN`)   |
| POST   | `/api/console`    | Dispatch console command via WebSocket          |
| GET    | `/api/files`      | Request file listing (dispatched via WS)        |
| POST   | `/api/files`      | Request file write (dispatched via WS)          |
| GET    | `/api/audit`      | Audit log entries                               |
| POST   | `/api/ai/chat`    | AI assistant chat                               |

---

## WebSocket

Two WebSocket endpoints:

### Dashboard clients
```
ws://<host>/ws?token=<accessToken>
```
Authenticated via JWT access token query parameter.

### Plugin client
```
ws://<host>/ws/plugin?apiKey=<PLUGIN_API_KEY>
```
Authenticated via API key.

### Dashboard receives these event types:

| Type                   | Payload                                      |
|------------------------|----------------------------------------------|
| `connected`            | Welcome message + clientType                 |
| `snapshot`             | Full state dump on connect                   |
| `heartbeat`            | `{ uptime, ts }`                             |
| `status`               | Full server status update                    |
| `performance`          | `{ tps, mspt, cpuUsage, ramUsed, ramTotal }` |
| `players`              | `{ players[], count }`                       |
| `worlds`               | `{ worlds[] }`                               |
| `plugins`              | `{ plugins[] }`                              |
| `console`              | `{ level, message, ts }`                     |
| `console_command`      | Echoed command dispatched to plugin          |
| `server_online`        | Server came online                           |
| `files_list_response`  | File listing from plugin                     |
| `files_write_response` | Write confirmation from plugin               |

### Plugin receives:

| Type                  | Description                  |
|-----------------------|------------------------------|
| `console_command`     | Execute command on the server |
| `files_list_request`  | List files at `path`         |
| `files_write_request` | Write `content` to `path`    |

### Reconnection

Clients should implement exponential-backoff reconnection. The server sends WebSocket ping frames every 30 seconds; clients that don't respond within one interval are terminated.

---

## AI Chat

```http
POST /api/ai/chat
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Why is my TPS dropping to 15?" }
  ]
}
```

Pass up to 20 messages for multi-turn context. The OPENAI_API_KEY is never sent to the frontend.

---

## Health Check

```http
GET /api/healthz
```
Public — no authentication required. Returns `{ status: "ok", uptime, ts }`.

---

## Render Deployment

1. Create a new **Web Service** on Render and connect your repo.
2. Set **Build command**: `npm install`
3. Set **Start command**: `node server.js`
4. Add all environment variables from `.env.example` via the Render dashboard.
5. Set `DATABASE_PATH` to `/var/data/wmcp.db` and mount a **Persistent Disk** at `/var/data`.
6. Set `CORS_ORIGIN` to `https://weaponmcpanel.netlify.app`.

### Health check

Configure Render's health check path to `/api/healthz`.

---

## Security Notes

- JWT access tokens expire in **15 minutes**. Refresh tokens expire in **7 days**.
- Login codes expire in **10 minutes** and are single-use.
- All previous unused login codes are invalidated when a new one is generated.
- Plugin API key comparison uses `crypto.timingSafeEqual` to prevent timing attacks.
- Rate limiting is applied per route group (auth: 20/15min, plugin: 120/min, AI: 10/min, default: 200/15min).
- Helmet sets 15 security headers including CSP, HSTS, and X-Content-Type-Options.
- Input validation rejects malformed bodies before they reach the database.
- The OPENAI_API_KEY is read only server-side and never included in any API response.
- All authentication events are written to the audit log.

---

## Logging

Winston writes structured JSON to:

- `logs/server.log` — all events (rotates at 20 MB, keeps 10 files)
- `logs/error.log` — errors only (rotates at 10 MB, keeps 5 files)

In development, pretty-printed logs are also written to stdout.

Events logged: plugin registration, dashboard login, authentication failures, console commands, AI requests, errors, WebSocket connect/disconnect, audit events.
