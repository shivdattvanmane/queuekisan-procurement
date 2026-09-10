# QueueKisan Queue Feature README

_Last updated: 2026-09-02_

This document explains the **actual implementation** of the QueueKisan queue feature: how booking works, how token numbers are generated, how realtime updates work, how ML-based ETA prediction works, what database changes were added, and how the full system was tested.

---

## 1. Purpose of this feature

The queue feature solves the full procurement queue lifecycle for farmers, counter staff, and admins.

It covers:
- slot booking
- server-side token generation
- queue position calculation
- ETA prediction
- farmer check-in
- counter actions like call / verify / skip / no-show / rejoin
- procurement lifecycle updates
- payment lifecycle updates
- realtime propagation with Socket.IO
- analytics and ML diagnostics

The implementation is **not UI-only**. The core logic is centralized in the backend queue server.

---

## 2. High-level architecture

```text
Farmer app (HTML/CSS/JS)
        |
        | HTTP + Socket.IO
        v
Queue Server (Express + Socket.IO)
        |
        | REST to Supabase + Python ML subprocess
        v
Supabase tables / RPC / queue history
        ^
        |
Counter app (React)      Admin app (React)
```

### Main components

#### Frontends
- `farmer/` — Farmer booking, queue tracking, notifications, check-in
- `counter/` — Counter-side queue control and procurement processing
- `admin/` — Monitoring, analytics, centre-level visibility

#### Backend
- `server/src/index.js` — API routes + realtime broadcasts + serves farmer app
- `server/src/services/queueEngine.js` — central queue business logic
- `server/src/services/mlService.js` — ML orchestration between Node and Python
- `server/src/services/analyticsEngine.js` — analytics summaries + heuristic fallback profiles
- `server/src/socket.js` — Socket.IO room-based realtime server
- `server/src/lib/supabase.js` — Supabase REST and RPC helper

#### ML layer
- `server/ml/predict_queue.py` — Python `scikit-learn` prediction pipeline

#### Database migration
- `supabase/queue_system.sql`

#### Verification
- `scripts/realtime_verify.mjs`
- `scripts/ml_verify.mjs`
- `scripts/e2e_verify.mjs`
- `scripts/DEEP-VERIFICATION.md`

---

## 3. Why a backend was needed

Originally, queue logic in this project was spread across the frontends. That creates problems:
- browser-side token generation is unsafe under concurrency
- queue ordering can drift across apps
- ETA formulas become inconsistent
- realtime becomes polling instead of push
- notifications and analytics lack a single source of truth

So this feature was implemented by moving queue control into a **central queue backend**.

That backend now owns:
- booking creation
- token sequencing
- queue ranking
- ETA calculation
- lifecycle timestamps
- queue event history
- farmer notifications
- realtime broadcasts
- analytics bundle generation
- ML diagnostics exposure

---

## 4. Queue states and lifecycle

### Queue statuses used
The queue engine works mainly with these statuses:
- `waiting`
- `serving`
- `completed`
- `skipped`
- `no-show`

### Related lifecycle states
Other related states in the data model include:
- `check_in_status`: `pending` / `checked-in`
- `verification_status`: `pending` / `completed`
- `procurement.status`: `pending` / `in-progress` / `completed`
- `payment.status`: `pending` / `processing` / `completed`

### Typical real flow

```text
Farmer books slot
-> token created
-> queue row created as waiting
-> farmer checks in
-> counter calls next
-> token becomes serving
-> counter verifies / records produce
-> procurement starts
-> amount confirmed
-> procurement completed
-> payment processing
-> payment completed
```

---

## 5. Backend API routes

Implemented in `server/src/index.js`.

### Health
- `GET /api/health`

### Farmer-facing booking and queue
- `POST /api/bookings/create`
- `POST /api/bookings/check-in`
- `GET /api/bookings/active/:farmerId`
- `GET /api/bookings/position/:bookingId`

### Counter-facing queue operations
- `GET /api/queue/officer/:officerId`
- `POST /api/queue/call-next`
- `POST /api/queue/action`
- `POST /api/queue/verify`
- `POST /api/queue/produce`
- `POST /api/queue/procurement/start`
- `POST /api/queue/procurement/confirm`
- `POST /api/queue/procurement/complete`
- `POST /api/queue/payment`

### Admin analytics
- `GET /api/analytics/bundle`
- `GET /api/analytics/ml-diagnostics`

The farmer web app is also served directly by the queue server:
- `/` redirects to `/farmer/login.html`
- `/farmer/*` serves the farmer frontend

---

## 6. Database design for queue feature

The core production tables already used by the system include:
- `users`
- `farmers`
- `procurement_centers`
- `centres`
- `slots`
- `queue_tokens`
- `procurements`
- `payments`
- `payment_status_history`
- `notifications`
- `counters`
- `crops`

### New / extended queue-related schema
Applied from `supabase/queue_system.sql`.

#### Added to `queue_tokens`
- `booked_at`
- `checked_in_at`
- `called_at`
- `service_started_at`
- `service_completed_at`
- `skipped_at`
- `rejoined_at`
- `no_show_at`
- `estimated_wait_minutes`
- `priority_score`
- `notification_stage`
- `last_event_at`
- `last_prediction_source`

These fields are important because ML needs real lifecycle timestamps, not only final status labels.

#### New table: `queue_events`
This stores queue lifecycle history.

Important columns:
- `token_id`
- `farmer_id`
- `centre_id`
- `counter_id`
- `event_type`
- `old_status`
- `new_status`
- `queue_position`
- `estimated_wait_minutes`
- `metadata`
- `created_at`

This table helps in two ways:
1. audit trail for queue state transitions
2. training data support for ETA prediction

#### New table: `queue_token_counters`
This supports centre-wise, date-wise token sequencing.

Columns:
- `centre_id`
- `queue_date`
- `last_number`
- `updated_at`

#### New RPC function: `next_queue_token(p_centre_id, p_queue_date)`
This function increments the counter atomically and returns a formatted token like:
- `T-001`
- `T-002`
- `T-003`

This is what makes token assignment database-driven.

---

## 7. Booking logic and token generation

Implemented mainly in `createBooking()` inside `server/src/services/queueEngine.js`.

### Step-by-step flow
1. validate farmer exists
2. validate procurement centre exists
3. validate slot exists and is not full
4. ensure the farmer does not already have an active booking
5. create booking id using server-side random generation
6. request next token number
7. insert row into `queue_tokens`
8. insert stub row into `procurements`
9. refresh slot booked count
10. create notification for farmer
11. rebuild queue predictions for that centre/date
12. write queue metrics back to DB
13. insert `queue_events` history row
14. return normalized booking object
15. emit realtime updates from API layer

### Booking ID format
Current server logic creates IDs like:

```text
BK-YYYYMMDD-<CENTRE>-<RANDOM>
```

### Token generation logic
Implemented in `nextTokenNumber()`.

#### Primary path: DB RPC
The server first tries:
- `restRpc('next_queue_token', { p_centre_id, p_queue_date })`

This is the preferred production path because it is database-driven and scoped by centre and date.

#### Fallback path
If RPC is unavailable, the server falls back to scanning same-day tokens and using max + 1.

That fallback exists only for compatibility if migration has not been applied.

### Why this is better than client-side token generation
- backend-controlled
- centre/date scoped
- consistent across all apps
- works with realtime and queue history
- supports atomic DB sequencing through Supabase RPC

---

## 8. Queue ordering logic

Implemented in `sortQueueRows()`.

### Current priority order
```text
serving -> waiting -> completed -> skipped -> no-show
```

### Waiting queue prioritization
For two rows both in `waiting`:
- checked-in farmers come before non-checked-in farmers
- otherwise sort by:
  - date
  - slot
  - booking time

### Why this rule exists
This reflects actual operations:
- current serving token must be first
- verified/checked-in farmers should move faster than absent farmers
- stable order reduces user confusion across Farmer, Counter, and Admin views

---

## 9. Queue metrics written back to database

After queue rebuild, the server updates each token row with:
- `position_ahead`
- `estimated_wait_time`
- `estimated_wait_minutes` when schema supports it
- `last_prediction_source` when schema supports it

This happens in `writeQueueMetrics()`.

So the UI does not need to invent its own queue math. The backend becomes authoritative.

---

## 10. Notification logic

Implemented mainly in:
- `ensureNotification()`
- `issueApproachingNotifications()`

### Notifications currently created for
- token generated
- check-in confirmed
- token skipped
- no-show recorded
- queue rejoined
- token now in service
- produce details updated
- procurement started
- amount confirmed
- procurement completed
- payment updated / completed
- turn approaching

### Approaching notification logic
The threshold is controlled by:
- `QUEUE_APPROACHING_THRESHOLD`

Default:
- `2`

If a waiting farmer has only 1 or 2 farmers ahead, the system creates a “Turn approaching” notification.

### Duplicate protection
Before inserting, recent notifications are checked to avoid obvious duplicates.

---

## 11. Realtime architecture with Socket.IO

Implemented in:
- `server/src/socket.js`
- `admin/src/services/socketService.js`
- `counter/src/services/socketService.js`
- `farmer/js/realtime.js`

### Rooms used
- `admin:global`
- `centre:<centreId>`
- `user:<userId>`
- `token:<bookingId>`

### Why rooms are used
Different users need different scopes:
- Admin sees all queue changes
- Counter sees assigned centre changes
- Farmer sees own booking and own notifications

### Broadcast model
The backend API route performs the queue mutation, then broadcasts relevant events.

Example:
- booking created -> `queue:updated`, `notification:new`, `analytics:updated`
- call next -> `token:called`, `queue:updated`, `notification:new`
- procurement complete -> `procurement:completed`, `payment:updated`, `analytics:updated`

### Event names currently used
- `queue:updated`
- `token:called`
- `token:verified`
- `token:skip`
- `token:no-show`
- `token:rejoin`
- `procurement:started`
- `procurement:details_updated`
- `procurement:amount_confirmed`
- `procurement:completed`
- `payment:updated`
- `notification:new`
- `analytics:updated`

### Farmer-side realtime behavior
The farmer UI dynamically loads the Socket.IO client from the backend and joins rooms based on:
- user id
- booking id
- centre id

Then it refreshes queue state whenever a relevant event arrives.

---

## 12. Counter workflow logic

Counter operations are implemented in `queueEngine.js`.

### `callNext(officerId)`
Rules:
1. load officer -> counter -> centre mapping
2. do not allow next call if a token is already `serving` at assigned centre
3. choose next token in this order:
   - assigned centre + waiting + checked-in
   - assigned centre + waiting
   - any centre + waiting + checked-in
   - any centre + waiting
4. mark token as `serving`
5. set `called_at` and `service_started_at` if columns exist
6. notify farmer
7. rebuild queue and write metrics
8. insert queue event history

### `updateBookingAction()`
Used for:
- `skip`
- `no-show`
- `rejoin`

It updates queue status, records timestamps where schema supports them, rebuilds the queue, notifies the farmer, and writes queue event history.

### `verifyFarmer()` / `checkInBooking()`
These mark the booking as checked-in and verified and then rebuild queue predictions.

### Procurement and payment functions
- `submitProduce()`
- `startProcurement()`
- `confirmAmount()`
- `completeProcurement()`
- `updatePayment()`

These functions connect queue state with procurement and payment state, so the queue system is not isolated from business workflow.

---

## 13. ML implementation overview

The ETA system is implemented as a **hybrid prediction system**.

Files:
- `server/src/services/mlService.js`
- `server/ml/predict_queue.py`
- `server/src/services/analyticsEngine.js`

### Why hybrid?
Real queue systems often have limited labeled data at first.
If we force a regression model too early, predictions become unstable.

So the system uses three layers:
1. historical profile fallback
2. queue-load clustering ML
3. service-duration regression ML

The system automatically chooses the strongest mode supported by available data.

---

## 14. Historical fallback logic

Implemented in `analyticsEngine.js`.

When full ML is not possible, the server builds historical profiles from:
- completed tokens
- procurement quantities
- crop price context
- centre averages
- hour-window averages
- current congestion

### Fallback outputs include
- `globalAvgServiceMinutes`
- `centreAvg`
- `cropAvg`
- `hourAvg`
- `peakHour`
- `congestionLevel`
- `congestionScore`
- `medianCompletedServiceMinutes`

### Heuristic ETA formula
The fallback service-time estimate uses weighted components:
- centre average
- crop average
- hour-window average
- median completed time
- quantity factor
- checked-in adjustment

This is the honest fallback path when labeled ML training data is not enough.

---

## 15. ML data preparation

Implemented in `mlService.js`.

### Training data sources
The server reads from:
- `queue_tokens`
- `procurements`
- `procurement_centers`
- `queue_events`

### How real service duration is inferred
The system tries these sources in order:

#### Source 1: lifecycle timestamp columns
If both exist:
- `service_started_at`
- `service_completed_at`

then:

```text
service_minutes = service_completed_at - service_started_at
```

#### Source 2: queue event timestamps
If lifecycle columns are unavailable, it looks for:
- `procurement-started` or `called`
- `procurement-completed`

then calculates duration from their timestamps.

#### Source 3: fallback
If neither exists, regression training cannot use that row.

### Feature engineering for hourly queue-load history
`buildHistoryAggregates()` groups history by:
- `centre_id`
- `hour_of_day`

Generated features include:
- `bookings_count`
- `completed_count`
- `no_show_count`
- `skipped_count`
- `checked_in_count`
- `avg_quantity_kg`
- `completion_rate`
- `centre_capacity`

### Feature engineering for regression training rows
`buildTrainingRows()` generates rows with:
- `centre_id`
- `crop`
- `hour_of_day`
- `quantity_kg`
- `check_in_flag`
- `centre_active_load`
- `hour_active_load`
- `bookings_count`
- `completion_rate`
- `service_minutes`
- `duration_source`

### Features for active prediction rows
`buildActiveRows()` creates live prediction inputs for tokens that are currently:
- `waiting`
- `serving`

---

## 16. Python ML model details

Implemented in `server/ml/predict_queue.py`.

### Model 1: KMeans clustering
Used to classify queue-load patterns.

Input features:
- `bookings_count`
- `completed_count`
- `no_show_count`
- `skipped_count`
- `checked_in_count`
- `avg_quantity_kg`
- `completion_rate`
- `centre_capacity`
- `hour_of_day`

Pipeline:
- `StandardScaler`
- `KMeans`

Cluster count:
- minimum of 3 or available sample count

Output effect:
- assigns clusters that are mapped to labels like `Low`, `Moderate`, `High`
- computes cluster-level base service minutes

### Model 2: RandomForestRegressor
Used for per-token service-duration estimation.

Input features:
- categorical:
  - `centre_id`
  - `crop`
- numeric:
  - `hour_of_day`
  - `quantity_kg`
  - `check_in_flag`
  - `centre_active_load`
  - `hour_active_load`
  - `bookings_count`
  - `completion_rate`

Pipeline:
- `ColumnTransformer`
- `OneHotEncoder` for categorical features
- passthrough numeric features
- `RandomForestRegressor`

Current training config:
- `n_estimators = 120`
- `random_state = 42`

### Minimum regression threshold
Controlled by:
- `QUEUE_ML_MIN_REGRESSION_SAMPLES`

Default:
- `5`

If fewer than 5 labeled completed runs exist, regression is considered not ready.

---

## 17. Prediction modes used by the system

The system exposes prediction source explicitly.

### `historical-heuristic`
Used when ML cannot be applied meaningfully.

### `ml-cluster`
Used when clustering is available but regression does not have enough labeled samples.

### `ml-hybrid`
Used when both clustering and regression are available.
This is the strongest mode currently implemented.

### How hybrid prediction is combined
For active rows, the Python service blends:
- cluster-based service estimate
- regression-based service estimate

Current blend:
- 65% regression
- 35% cluster baseline

Then small operational adjustments are applied:
- checked-in farmers get a slight reduction
- not-yet-checked-in farmers get a slight penalty

Final service time is clamped to a sane range.

---

## 18. How wait time is calculated for the queue

After per-token service minutes are predicted, the model computes cumulative wait.

### Logic
- if token is `serving`, estimated wait = `0`
- for waiting tokens, wait is cumulative predicted service time of active rows ahead
- `farmersAhead` is based on prior active rows in sorted order

This means ETA is no longer just “10 min × people ahead”.
It is based on actual predicted service behavior and live queue composition.

---

## 19. ML diagnostics exposed by the system

Available from:
- `GET /api/analytics/ml-diagnostics`
- also included in `GET /api/analytics/bundle`

Diagnostics include:
- `model`
- `clusterSamples`
- `regressionSamples`
- `lifecycleSamples`
- `eventDerivedSamples`
- `regressionMinimum`
- `regressionReady`
- `queueEventCount`
- `activePredictionCount`
- `trainR2`
- `clusters`
- `fallbackReason`

### Why diagnostics matter
This prevents fake AI claims.
The system can explicitly show:
- whether RandomForest is active
- whether only cluster ML is active
- whether fallback is still in use
- how much labeled data exists

---

## 20. Farmer-facing ML visibility

The farmer UI now shows prediction insight on:
- `farmer/live-queue.html`
- `farmer/token-generated.html`

Visible items include:
- prediction source
- queue load cluster
- predicted service time or ETA insight

This uses backend data returned from:
- `getActiveBooking()`
- `getQueuePosition()`

The frontend does not invent model labels on its own; it displays backend-provided prediction metadata.

---

## 21. Admin-facing ML visibility

The admin analytics page now shows:
- prediction engine type
- regression readiness
- minimum labeled run threshold
- recorded lifecycle sample count
- queue event count
- active ETA prediction count
- cluster summaries
- fallback reason when regression is not ready
- training R² when available

This is implemented in:
- `admin/src/pages/Analytics.jsx`

---

## 22. Rebuild cycle after each queue mutation

A very important design decision is that after every meaningful queue change, the server rebuilds queue metrics for the affected centre/date.

Examples:
- booking created
- check-in completed
- call next
- skip / no-show / rejoin
- procurement start
- procurement completion

### Rebuild includes
- load fresh bundle from Supabase
- normalize rows
- sort queue
- run ML / fallback prediction pipeline
- write `position_ahead` and ETA fields back to DB
- create approaching notifications when appropriate

This keeps Farmer, Counter, and Admin aligned.

---

## 23. Frontend fallback behavior

Although the backend is authoritative, the apps still contain compatibility fallback paths.

### Farmer fallback
If queue server is unavailable:
- farmer app can still read directly from Supabase
- queue position falls back to simpler local logic
- prediction metadata becomes heuristic / unclassified

### Counter fallback
If queue server is unavailable:
- counter app contains backup Supabase-driven behavior
- but the preferred path is the backend API

### Admin fallback
If queue server is unavailable:
- analytics fall back to simple table-derived calculations
- ML diagnostics indicate fallback mode

These fallbacks exist for resilience, not as the primary implementation.

---

## 24. Verification and testing

This feature was not left untested.

### `scripts/realtime_verify.mjs`
Tests real Socket.IO delivery:
- booking update reaches admin room
- booking update reaches centre room
- farmer notification event arrives
- token called event arrives
- procurement-started event arrives
- payment-updated event arrives

### `scripts/ml_verify.mjs`
Tests real ML activation:
- seeds completed labeled runs through real backend
- verifies diagnostics switch to `hybrid_ml`
- verifies queue position endpoint returns `predictionSource: ml-hybrid`
- verifies load cluster and predicted service minutes are returned

### `scripts/e2e_verify.mjs`
Tests full multi-role workflow:
- farmer registration/login
- centre and slot visibility
- booking creation
- queue position
- check-in
- counter processing
- procurement and payment completion
- admin services and analytics
- prediction metadata availability

### Result
The current verification summary is recorded in:
- `scripts/DEEP-VERIFICATION.md`

Status:
- **PASS**

---

## 25. Current known limitations

This implementation is real, but these are the honest current limitations:

### 1. Full booking flow is orchestrated server-side, not one SQL transaction
The backend now centralizes the logic, but booking still involves multiple DB writes:
- queue token
- procurement stub
- slot count refresh
- notification

### 2. Regression quality depends on real labeled history
If few completed rows have usable lifecycle timestamps or queue events, the system falls back to:
- cluster ML
- historical heuristic

### 3. Some fallback client logic still exists
This is intentional for compatibility, but authoritative logic is on the server.

---

## 26. Why this implementation is credible

Because the system now has all of these working together:
- real Express backend
- real Socket.IO rooms and events
- real Supabase RPC for token generation
- real queue event history table
- real lifecycle timestamps
- real Python `scikit-learn` pipeline
- real fallback transparency through diagnostics
- real end-to-end verification scripts

This is the difference between:
- showing a queue UI,
and
- implementing a working queue platform.

---

## 27. Important file map

### Backend core
- `server/src/index.js`
- `server/src/services/queueEngine.js`
- `server/src/services/mlService.js`
- `server/src/services/analyticsEngine.js`
- `server/src/socket.js`
- `server/src/lib/supabase.js`

### Farmer integration
- `farmer/js/krushiApi.js`
- `farmer/js/realtime.js`
- `farmer/live-queue.html`
- `farmer/live-queue.js`
- `farmer/token-generated.html`
- `farmer/token-generated.js`

### Counter integration
- `counter/src/services/queueApi.js`
- `counter/src/services/socketService.js`

### Admin integration
- `admin/src/services/adminApi.js`
- `admin/src/services/socketService.js`
- `admin/src/pages/Analytics.jsx`

### Database and test docs
- `supabase/queue_system.sql`
- `scripts/realtime_verify.mjs`
- `scripts/ml_verify.mjs`
- `scripts/e2e_verify.mjs`
- `scripts/DEEP-VERIFICATION.md`

---

## 28. How to explain this feature in a demo

Short version:

1. Farmer books a slot.
2. Queue server creates a booking and gets a unique token from Supabase RPC.
3. Queue engine rebuilds positions and ETAs.
4. Farmer, Counter, and Admin receive live Socket.IO updates.
5. Counter actions continuously push queue state changes.
6. Queue events and lifecycle timestamps are stored.
7. ML uses that historical data to improve ETA prediction.
8. Admin can inspect diagnostics to see whether the system is in heuristic, cluster ML, or hybrid ML mode.

---

## 29. Future improvements

Good next upgrades would be:
- wrap booking flow in a single database transaction or stored procedure
- train with larger historical datasets across more centres and crops
- add model versioning / saved training artifacts
- record explicit no-show timing and rejoin timing features for ML
- show prediction badges directly in counter queue rows too
- add offline-safe queued event replay if network is unstable

---

## 30. Final summary

This queue feature is implemented as a **central backend-driven, realtime, ML-assisted procurement queue system**.

### Core characteristics
- **server-owned queue logic**
- **Supabase-backed persistence**
- **RPC-driven token numbering**
- **queue history capture**
- **Socket.IO realtime fanout**
- **KMeans + RandomForest ETA engine**
- **fallback transparency**
- **verified end-to-end behavior**

If you need a shorter version for project submission, use this file as the source and derive a condensed summary from it.
