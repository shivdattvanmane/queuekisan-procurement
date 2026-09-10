# QueueKisan

QueueKisan is a multi-role procurement and farmer queue platform with:

- **Admin app** — dashboards, queue monitoring, analytics, reports
- **Counter app** — live token calling, verification, procurement, payment updates
- **Farmer app** — booking, token view, live queue, notifications, history
- **Queue server** — centralized queue engine, Socket.IO realtime updates, and AI-style wait prediction

## Stack

- **Supabase** — core data store
- **Firebase Auth** — authentication
- **Socket.IO** — realtime updates across Farmer, Counter, and Admin
- **Node + Express** — queue orchestration backend
- **React + Vite** — Admin and Counter
- **HTML/CSS/JS** — Farmer app

---

## Current repo structure

```text
queuekisan-working-updated/
├── admin/
├── counter/
├── farmer/
├── server/
├── scripts/
└── supabase/
```

---

## What is implemented now

### Queue engine
- database-backed booking creation
- server-generated booking IDs
- server-mediated token generation
- dynamic farmers-ahead calculation
- historical heuristic wait prediction
- queue lifecycle actions:
  - call next
  - verify/check-in
  - skip
  - no-show
  - rejoin
  - start procurement
  - confirm amount
  - complete procurement
  - update payment

### Realtime
- Socket.IO server added
- Counter listens for live queue changes
- Farmer live queue listens for token/centre/user events
- Farmer notifications page refreshes from live events
- Admin dashboard, queue monitoring, and analytics refresh from live events

### Analytics
- peak-hour prediction
- average processing-time estimate
- congestion score
- AI-style wait prediction using historical procurement/queue patterns

---

## Important setup

### 1) Queue server env
Create:

- `server/.env`

Example:

```env
PORT=8000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
QUEUE_APPROACHING_THRESHOLD=2
CORS_ORIGIN=*
```

### 2) Frontend env/config
Already separated in:

- `admin/.env`
- `counter/.env`
- `farmer/js/appConfig.js`

For farmer realtime, set:

```js
window.KRUSHI_QUEUE_SERVER_URL = 'http://localhost:8000';
```

### 3) Optional Supabase SQL migrations
Apply these in Supabase SQL editor for the full enhanced queue feature set:

- `supabase/queue_system.sql`
- `supabase/farmer_payment_details.sql`

`queue_system.sql` adds:
- lifecycle timestamps on `queue_tokens`
- `queue_events`
- `queue_token_counters`

The server code is written to **degrade gracefully** if those tables/columns are not applied yet.

---

## Run locally

Open 4 terminals.

### Terminal 1 — Queue server

```bash
cd server
npm install
npm start
```

### Terminal 2 — Admin

```bash
cd admin
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

### Terminal 3 — Counter

```bash
cd counter
npm install
npm run dev
```

Open:

```text
http://localhost:5174/acc/login
```

### Terminal 4 — Farmer

```bash
cd farmer
python -m http.server 5500
```

Open:

```text
http://localhost:5500/login.html
```

---

## Realtime flow

### Farmer booking
1. farmer books a slot
2. queue server creates booking + token
3. queue server stores queue/procurement data in Supabase
4. queue server emits Socket.IO events
5. counter/admin/farmer screens refresh live

### Counter processing
1. counter calls next token
2. queue position and ETA are recalculated
3. approaching/called notifications are stored
4. live events refresh queue screens automatically

---

## Real-user login examples

### Admin
- `usr-a001 / test1234`
- `usr-41033 / Admin@12345`
- `usr-31633 / Admin123`

### Counter
- `usr-c001 / password123`
- `usr-c002 / password123`
- `usr-c003 / password123`

### Farmer
- `9876543210 / pass123`
- `9876543211 / pass123`
- `9876543213 / pass123`
- `9876543215 / password123`

---

## Deep analysis artifact

A detailed implementation audit and architecture recommendation is saved here:

- `QUEUE_SYSTEM_ANALYSIS.md`

---

## Verification completed in workspace

Verified successfully during this update:

- `admin` build ✅
- `counter` build ✅
- queue server health ✅
- queue server analytics endpoint ✅
- queue server officer queue endpoint ✅
- full temporary API lifecycle test ✅
  - booking
  - queue position
  - check-in
  - call next
  - produce entry
  - procurement start
  - amount confirm
  - procurement complete
  - payment complete
  - cleanup

---

## Notes

- Existing UI feel is preserved.
- Supabase remains the source of truth.
- Firebase remains the auth layer.
- Socket.IO is now introduced as a proper realtime channel.
- The current AI prediction layer is **practical historical heuristic AI**, not a heavyweight offline ML training pipeline.
- This is the recommended first production-style step for this repo.

**ai-chatbot**
for starting 
python -m uvicorn predict_api:app --host 127.0.0.1 --port 8100
**in second terminal**
cd "C:\Users\rushi\Downloads\share (2)\share\server"
npm start
**verfication in terminal** 
curl http://127.0.0.1:8100/health