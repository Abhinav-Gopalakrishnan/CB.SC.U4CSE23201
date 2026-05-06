# CB.SC.U4CSE23201 - Backend Track


This repository contains my submissions for the Backend Track evaluation. Each folder addresses a different problem statement, built using Node.js and JavaScript.

---

## Repository Structure

```
.
├── logging_middleware/        
├── vehicle_maintence_scheduler/  
├── notification_app_be/       
├── notification_system_design.md 
└── .gitignore
```

---

## 1. Logging Middleware

A standalone, reusable logging module that ships structured log entries to a remote evaluation server.

**What it does:**
- Exposes a single function `Log(stack, level, package, message)` that any application can import and call.
- Handles authentication internally, caching the JWT token and refreshing it when it expires.
- Validates every parameter before sending -- checks that the stack, level, and package values are within the allowed set. Messages longer than the server's 48-character limit are automatically trimmed.
- On success, prints the log ID returned by the server. On failure, logs the error locally and re-throws so the caller can decide what to do.

**Allowed values:**
- **Stack:** `backend`, `frontend`
- **Level:** `info`, `warn`, `error`, `fatal`
- **Backend packages:** `cache`, `controller`, `cron_job`, `db`, `domain`, `handler`, `repository`, `route`, `service`
- **Frontend packages:** `api`, `component`, `hook`, `page`, `state`, `style`
- **Shared packages:** `auth`, `config`, `middleware`, `utils`

**How to run:**
```bash
cd logging_middleware
npm install
npm test
```

---

## 2. Vehicle Maintenance Scheduler

Solves a resource allocation problem for a logistics company. Each depot has a fixed number of mechanic-hours per day, and each vehicle maintenance task has a duration and an operational impact score. The goal is to pick tasks that maximize total impact without going over the hour budget.

**How it works:**
- Fetches depot data (ID + available hours) and vehicle task data (ID + duration + impact) from the evaluation API.
- Treats each depot independently as a 0/1 knapsack instance. Uses bottom-up dynamic programming with a 1D array for the DP table and a 2D keep-table for backtracking which tasks were selected.
- Prints a formatted table per depot showing every selected task, total hours used, and the maximum impact achieved.
- Integrates the logging middleware to record each step of the process.


**How to run:**
```bash
cd vehicle_maintence_scheduler
npm install
npm start
```

---

## 3. Notification App (Priority Inbox)

Implements a priority inbox that surfaces the top N most important unread notifications. This is the Stage 6 deliverable for the Campus Notifications Microservice.

**Priority ranking logic:**
- Notifications are scored using: `score = (typeWeight * 1e12) + timestamp_ms`
- Type weights: Placement = 3, Result = 2, Event = 1
- This guarantees all Placements appear before all Results, which appear before all Events. Within the same type, newer notifications rank higher.

**Efficient top-N maintenance:**
- Uses a min-heap of fixed size N. As each notification is processed, it is compared against the heap's root (the lowest-scoring entry in the current top N). If the new notification scores higher, it replaces the root and the heap is re-balanced.
- Insertion cost: O(log N) per notification. Total cost for m notifications: O(m log N).
- When new notifications keep arriving, only an O(log N) operation is needed per arrival rather than re-sorting the entire list.

**How to run:**
```bash
cd notification_app_be
npm install
npm start
```

---

## 4. Notification System Design

The file `notification_system_design.md` contains a detailed writeup across six stages:

| Stage | Topic |
|-------|-------|
| 1 | REST API endpoint design, request/response schemas, and real-time delivery mechanism using WebSockets |
| 2 | PostgreSQL schema design, index strategy, and SQL queries mapped to each API endpoint |
| 3 | Analysis of a slow query on 5M rows, why blanket indexing is harmful, and a composite partial index solution |
| 4 | Multi-layer caching with Redis and HTTP ETags to reduce DB load from repeated page-load fetches |
| 5 | Redesign of a naive sequential notify-all loop into a batch-insert + async-queue architecture with retry logic |
| 6 | Priority inbox scoring formula and min-heap approach for maintaining top N notifications efficiently |

---

## API Endpoints Used

All three applications authenticate against and consume the following evaluation service:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/evaluation-service/auth` | Obtain Bearer token |
| GET | `/evaluation-service/depots` | Fetch depot data |
| GET | `/evaluation-service/vehicles` | Fetch vehicle task data |
| GET | `/evaluation-service/notifications` | Fetch notification data |
| POST | `/evaluation-service/logs` | Send structured log entries |

Base URL: `http://20.207.122.201`

---

## Tech Stack

- **Runtime:** Node.js
- **HTTP Client:** Axios
- **Language:** JavaScript (CommonJS modules)
