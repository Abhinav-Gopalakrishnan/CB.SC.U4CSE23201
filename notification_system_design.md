# Notification System Design

---

## Stage 1

### Core Actions the Notification Platform Should Support

1. **Create Notification** -- post a new notification (Placement, Event, or Result)
2. **Fetch Notifications** -- retrieve notifications for a logged-in user
3. **Mark as Read** -- mark a single notification as read
4. **Mark All as Read** -- mark all notifications for a user as read
5. **Delete Notification** -- remove a notification
6. **Real-time Delivery** -- push notifications to connected users instantly

---

### REST API Endpoints

#### 1. Create a Notification

```
POST /api/notifications
```

**Request Headers:**
```json
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "type": "Placement",
  "message": "Google LLC hiring",
  "targetStudentIds": ["student-uuid-1", "student-uuid-2"]
}
```

**Response (201 Created):**
```json
{
  "id": "notif-uuid-1",
  "type": "Placement",
  "message": "Google LLC hiring",
  "timestamp": "2026-05-06T09:00:00Z",
  "isRead": false
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Invalid notification type. Must be one of: Placement, Event, Result"
}
```

---

#### 2. Get All Notifications for a User

```
GET /api/notifications?page=1&limit=20&type=Placement&isRead=false
```

**Request Headers:**
```json
{
  "Authorization": "Bearer <jwt_token>"
}
```

**Response (200 OK):**
```json
{
  "notifications": [
    {
      "id": "notif-uuid-1",
      "type": "Placement",
      "message": "Google LLC hiring",
      "timestamp": "2026-05-06T09:00:00Z",
      "isRead": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 45,
    "totalPages": 3
  }
}
```

---

#### 3. Mark a Notification as Read

```
PATCH /api/notifications/:notificationId/read
```

**Request Headers:**
```json
{
  "Authorization": "Bearer <jwt_token>"
}
```

**Response (200 OK):**
```json
{
  "id": "notif-uuid-1",
  "isRead": true,
  "readAt": "2026-05-06T10:15:00Z"
}
```

---

#### 4. Mark All Notifications as Read

```
PATCH /api/notifications/read-all
```

**Request Headers:**
```json
{
  "Authorization": "Bearer <jwt_token>"
}
```

**Response (200 OK):**
```json
{
  "message": "All notifications marked as read",
  "updatedCount": 12
}
```

---

#### 5. Delete a Notification

```
DELETE /api/notifications/:notificationId
```

**Request Headers:**
```json
{
  "Authorization": "Bearer <jwt_token>"
}
```

**Response (200 OK):**
```json
{
  "message": "Notification deleted successfully",
  "id": "notif-uuid-1"
}
```

---

### Real-Time Notification Mechanism

**Approach: WebSocket (Socket.IO)**

WebSockets provide full-duplex, persistent connections between client and server, making them ideal for real-time push notifications.

**How it works:**

1. When a student logs in, the frontend opens a WebSocket connection to the server.
2. The server maps `studentId -> socketId` in memory (or Redis for multi-server setups).
3. When a new notification is created via `POST /api/notifications`, the server:
   - Persists the notification to the database.
   - Looks up the target student's active socket connection.
   - Pushes the notification payload over the WebSocket in real-time.
4. If the student is offline, the notification is stored in DB and delivered on next login/fetch.

**WebSocket Events:**

| Event Name              | Direction       | Payload                                      |
|-------------------------|-----------------|----------------------------------------------|
| `connection`            | Client -> Server | JWT token for authentication                |
| `new-notification`      | Server -> Client | `{ id, type, message, timestamp }`          |
| `notification-read`     | Client -> Server | `{ notificationId }`                        |
| `notification-read-ack` | Server -> Client | `{ notificationId, isRead: true }`          |

**Why WebSocket over alternatives:**

| Mechanism        | Latency | Server Load | Complexity |
|------------------|---------|-------------|------------|
| Polling          | High    | High        | Low        |
| Long Polling     | Medium  | Medium      | Medium     |
| SSE              | Low     | Low         | Medium     |
| **WebSocket**    | **Low** | **Low**     | **Medium** |

WebSocket is the best fit because notifications require instant delivery, bidirectional communication (mark-as-read acknowledgments), and low overhead for concurrent student connections.

---

## Stage 2

### Recommended Database: PostgreSQL

**Why PostgreSQL over MySQL or NoSQL:**

- Strong ACID compliance ensures notification delivery is reliable (no lost notifications).
- Native support for ENUM types maps directly to notification types (Placement, Event, Result).
- Excellent indexing support (B-tree, partial indexes) for the query patterns we need.
- JSON/JSONB support if notification payloads need to be flexible in the future.
- Scales well for 50,000 students with proper indexing.

---

### Database Schema

```sql
-- Students table
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notification type enum
CREATE TYPE notification_type AS ENUM ('Placement', 'Event', 'Result');

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    message VARCHAR(255) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    read_at TIMESTAMP
);

-- Index for fetching unread notifications per student (most common query)
CREATE INDEX idx_notifications_student_unread
    ON notifications (student_id, is_read, created_at DESC)
    WHERE is_read = FALSE;

-- Index for filtering by type
CREATE INDEX idx_notifications_student_type
    ON notifications (student_id, notification_type, created_at DESC);
```

---

### Potential Problems at Scale

1. **Table bloat** -- With 50,000 students and millions of notifications, the table grows fast. Solved with periodic archival of old read notifications to a `notifications_archive` table.
2. **Write contention** -- Bulk notify operations (e.g., placement announcement to all students) cause insert spikes. Solved with batch inserts and async processing via a message queue.
3. **Read-heavy hot paths** -- Fetching unread notifications on every page load. Solved with caching (see Stage 4).

---

### SQL Queries for REST APIs

#### Create Notification (POST /api/notifications)
```sql
INSERT INTO notifications (student_id, notification_type, message)
VALUES ($1, $2, $3)
RETURNING id, notification_type, message, is_read, created_at;
```

#### Get Notifications (GET /api/notifications)
```sql
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

#### Get Unread Notifications
```sql
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC;
```

#### Mark as Read (PATCH /api/notifications/:id/read)
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE id = $1 AND student_id = $2
RETURNING id, is_read, read_at;
```

#### Mark All as Read (PATCH /api/notifications/read-all)
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

#### Delete Notification (DELETE /api/notifications/:id)
```sql
DELETE FROM notifications
WHERE id = $1 AND student_id = $2;
```

---

## Stage 3

### Analyzing the Existing Query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

**Is this query accurate?**

Yes, functionally it retrieves the correct data -- all unread notifications for a specific student, sorted newest first.

**Why is it slow?**

Without an index, PostgreSQL performs a full table scan on 5,000,000 rows, filtering by `studentID` and `isRead`, then sorting by `createdAt`. With 50,000 students, each scan touches millions of irrelevant rows.

**Likely computation cost:** O(n) where n = 5,000,000 rows. Each row is read from disk, checked against the WHERE clause, and discarded if it doesn't match.

**What would you change?**

Create a **composite partial index** specifically targeting this query pattern:

```sql
CREATE INDEX idx_unread_by_student
    ON notifications (student_id, created_at DESC)
    WHERE is_read = FALSE;
```

This index:
- Only indexes unread notifications (partial index), so it is much smaller.
- Includes `student_id` as the leading column for equality lookup.
- Includes `created_at DESC` so the ORDER BY is satisfied by the index without a separate sort step.
- Turns the query from a full table scan into an index-only scan: O(log n + k) where k = matching rows.

---

### Should you add indexes on every column?

**No. This is bad advice.** Here is why:

1. **Write overhead** -- Every INSERT, UPDATE, and DELETE must also update every index. With bulk notification creation (50,000 inserts for a placement announcement), this multiplies write time significantly.
2. **Storage cost** -- Each index consumes disk space. Indexes on rarely-queried columns waste storage.
3. **Planner confusion** -- Too many indexes can cause the query planner to pick a suboptimal index.

**The right approach:** Index only the columns that appear in WHERE, ORDER BY, and JOIN clauses of your actual query patterns.

---

### Query: Find all students who got a placement notification in the last 7 days

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

Supporting index:
```sql
CREATE INDEX idx_notifications_type_date
    ON notifications (notification_type, created_at DESC);
```

---

## Stage 4

### Problem

Notifications are fetched on every page load for every student. With 50,000 students loading pages frequently, the database is overwhelmed.

### Solution: Multi-Layer Caching Strategy

#### Layer 1: Application-Level Cache (Redis)

Cache each student's unread notifications in Redis with a TTL.

```
Key:    notifications:unread:{studentId}
Value:  JSON array of unread notifications
TTL:    5 minutes
```

**Read flow:**
1. Check Redis for `notifications:unread:{studentId}`.
2. If cache HIT, return cached data (no DB query).
3. If cache MISS, query PostgreSQL, store result in Redis, return data.

**Write flow (cache invalidation):**
When a new notification is created or marked as read, delete the relevant cache key:
```
DEL notifications:unread:{studentId}
```

#### Layer 2: HTTP Caching (ETag / If-None-Match)

Return an ETag header with notification responses. On subsequent requests, the client sends `If-None-Match`. If notifications haven't changed, return `304 Not Modified` (zero payload).

```
Response Headers:
  ETag: "abc123hash"
  Cache-Control: private, max-age=60
```

#### Tradeoffs

| Strategy         | Pros                                    | Cons                                        |
|------------------|-----------------------------------------|---------------------------------------------|
| Redis Cache      | Sub-ms reads, reduces DB load by ~90%   | Added infrastructure, cache invalidation complexity |
| HTTP ETag        | Reduces bandwidth, no extra infra       | Still hits server (just not DB if cached)   |
| No caching       | Always fresh data                       | DB overloaded at scale                      |

**Recommendation:** Use Redis as the primary cache layer with aggressive invalidation on writes. Add HTTP caching as a secondary layer for bandwidth savings.

---

## Stage 5

### Analyzing the Original Implementation

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)    # calls Email API
        save_to_db(student_id, message)    # DB insert
        push_to_app(student_id, message)   # real-time push
```

### Shortcomings

1. **Sequential processing** -- 50,000 students processed one at a time. If each iteration takes 100ms, total time = 5,000 seconds (~83 minutes).
2. **Partial failure** -- If `send_email` fails at student 200, the remaining 49,800 students get nothing. No retry, no rollback.
3. **Tight coupling** -- Email, DB, and push are coupled in the same synchronous loop. A slow Email API blocks DB writes and push notifications.
4. **No atomicity** -- If email succeeds but DB insert fails, the student received an email but has no record of the notification. Data is inconsistent.

### Should DB save and email happen together?

**No.** They should be decoupled. The DB save should happen first (it is the source of truth), and the email should be dispatched asynchronously. Reasons:

- DB writes are fast and reliable (~1-5ms). Email API calls are slow and unreliable (~100-500ms, can timeout).
- If the email fails, the notification still exists in DB and can be retried.
- If the DB fails, we should not send an email for a notification that was never recorded.

### Redesigned Implementation

```
function notify_all(student_ids: array, message: string):
    # Step 1: Batch insert all notifications into DB (single query)
    notification_ids = batch_insert_to_db(student_ids, message)

    # Step 2: Publish async jobs for email and push
    for batch in chunk(zip(student_ids, notification_ids), size=500):
        email_queue.publish({
            "batch": batch,
            "message": message,
            "retry_count": 0,
            "max_retries": 3
        })
        push_queue.publish({
            "batch": batch,
            "message": message
        })

# --- Async Email Worker (processes queue) ---
function email_worker(job):
    for student_id, notif_id in job.batch:
        try:
            send_email(student_id, job.message)
            mark_email_sent(notif_id)
        except EmailFailure:
            if job.retry_count < job.max_retries:
                email_queue.publish({...job, retry_count: job.retry_count + 1})
            else:
                log_failed_email(student_id, notif_id)
                alert_admin(student_id, notif_id)

# --- Async Push Worker (processes queue) ---
function push_worker(job):
    for student_id, notif_id in job.batch:
        try:
            push_to_app(student_id, job.message)
        except PushFailure:
            # Push failures are non-critical; log and continue
            log_failed_push(student_id, notif_id)
```

### Key improvements:

1. **Batch DB insert** -- Single SQL query inserts all 50,000 rows instead of 50,000 individual inserts.
2. **Async processing** -- Email and push are dispatched to message queues (e.g., RabbitMQ, Redis Streams). The API returns immediately.
3. **Retry logic** -- Failed emails are retried up to 3 times with exponential backoff.
4. **Chunked batches** -- Students are processed in batches of 500 to avoid overwhelming the email API.
5. **DB-first guarantee** -- Notifications are persisted before any delivery attempt, ensuring data consistency.

---

## Stage 6

### Priority Inbox Approach

**Priority is determined by two factors:**

1. **Type weight** (higher = more important):
   - Placement = 3
   - Result = 2
   - Event = 1

2. **Recency** -- More recent notifications rank higher within the same type weight.

**Scoring formula:**
```
score = (typeWeight * 1e12) + timestamp_ms
```

This ensures all Placements always rank above all Results, which always rank above all Events. Within the same type, recency breaks the tie.

**Efficient maintenance of top N:**
A min-heap of size N is used. As new notifications arrive, compare against the heap's minimum. If the new notification's score is higher, replace the min and re-heapify. This gives O(log N) per insertion instead of O(N log N) for re-sorting.

**Implementation:** See `notification_app_be/index.js` for the working code.
