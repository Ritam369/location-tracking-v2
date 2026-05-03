# location-tracker-v2

A real-time multi-user location tracking app with OAuth2.0 + OIDC authentication via [chaiaurauth.tech](https://www.chaiaurauth.tech), a Kafka-based event pipeline, and Socket.IO for live map updates.

---

## Project Overview

A single Node.js server:

- **Location Tracker Server** (`location-tracker-server.js`) — serves the map UI, authenticates via OAuth2.0 Authorization Code flow with `chaiaurauth.tech` as the external identity provider, and streams location updates over WebSockets through Kafka.

Users are redirected to `chaiaurauth.tech` to sign in. After a successful login, the provider redirects back with an authorization code, which the server exchanges for tokens. The `id_token` (a signed JWT) is stored as an `httpOnly` cookie and verified on every request using the provider's public JWKS endpoint. All location events flow through Kafka so the pipeline is decoupled and horizontally scalable.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Web framework | Express 5 |
| Real-time | Socket.IO |
| Message broker | Kafka (KafkaJS) |
| Auth | OAuth2.0 / OIDC via [chaiaurauth.tech](https://www.chaiaurauth.tech) (jwks-rsa + jsonwebtoken) |
| Database | PostgreSQL 17 (Drizzle ORM) |
| Infrastructure | Docker Compose |

---

## Setup Steps

### 1. Prerequisites

- [Bun](https://bun.sh) installed
- Docker + Docker Compose

### 2. Clone & install dependencies

```bash
git clone <repo-url>
cd location-tracker-v2
bun install
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in your OAuth2.0 client credentials — see Environment Variables section below
```

### 4. Start infrastructure

```bash
docker compose up -d
```

### 5. Run database migrations

```bash
bun run db:migrate
```

### 6. Create Kafka topic

```bash
bun run kafka:admin
```

### 7. Start server

```bash
# Terminal 1 — Location tracker server
bun run tracker

# Terminal 2 — Kafka → DB processor (optional persistence)
bun run db:processor
```

Open `http://localhost:3000` — you'll be redirected to sign in.

---

## Environment Variables

Create a `.env` file in the project root:

```env
TRACKER_PORT=3000

CHAI_AUR_AUTH_ISSUER=https://www.chaiaurauth.tech
CHAI_AUR_AUTH_CLIENT_ID=<your-client-id>
CHAI_AUR_AUTH_CLIENT_SECRET=<your-client-secret>

CHAI_AUR_AUTH_REDIRECT_URI=http://localhost:3000/oidc/callback
```

> Register your app at `chaiaurauth.tech` to obtain a `client_id` and `client_secret`. The redirect URI must match exactly what is registered with the provider.

---

## OAuth2.0 Auth Setup

Authentication is fully delegated to the external provider `chaiaurauth.tech`. The tracker server exposes two OIDC-related routes:

| Endpoint | Description |
|---|---|
| `GET /oidc/login` | Redirects the user to `chaiaurauth.tech` authorization endpoint |
| `GET /oidc/callback` | Receives the authorization code, exchanges it for tokens, sets cookie |

**Auth flow:**

1. User visits the tracker server → unauthenticated requests redirect to `/oidc/login`.
2. `/oidc/login` builds an authorization URL with `response_type=code`, `scope=openid profile email`, and redirects the user to `chaiaurauth.tech/o/authorization`.
3. After the user authenticates, the provider redirects to `/oidc/callback?code=<code>`.
4. The callback handler POSTs to `chaiaurauth.tech/o/token` with the code, `client_id`, `client_secret`, and `redirect_uri` to obtain tokens.
5. The `id_token` (RS256 JWT) is set as an `httpOnly` cookie named `access_token`.
6. All subsequent HTTP requests and Socket.IO connections are authenticated by verifying the `access_token` cookie against the provider's JWKS at `chaiaurauth.tech/o/certs`.

---

## Socket Event Flow

```
Client                          Server
  |                               |
  |-- connect (access_token) ---> |  io.use() verifies id_token JWT via JWKS
  |                               |
  |-- client:location:update ---> |  produces message to Kafka topic
  |       { latitude, longitude } |  "location-updates" (key = userId)
  |                               |
  |<-- server:location:update --- |  consumer broadcasts to all sockets
  |  { userId, firstName,         |  (clients skip their own userId)
  |    latitude, longitude }      |
  |                               |
  |-- client:whoami ------------> |
  |<-- server:whoami ------------ |  { userId }
  |                               |
  |-- disconnect ---------------> |
  |<-- server:user:disconnected - |  { userId } — broadcast to all
```

Location updates are sent every **5 seconds** from the browser via `navigator.geolocation`.

---

## Kafka Event Flow

```
Browser
  └─► Socket.IO (client:location:update)
        └─► KafkaJS Producer
              └─► Topic: location-updates  (3 partitions, keyed by userId)
                    ├─► Socket Server Consumer (groupId: socket-server-<PORT>)
                    │     └─► io.emit("server:location:update") → all clients
                    └─► DB Processor Consumer (groupId: database-processor)
                          └─► INSERT INTO location_history (console stub)
```

- Partitioning by `userId` ensures ordered delivery per user.
- The socket server and DB processor are independent consumer groups — both receive every message.
- The DB processor (`database-processor.js`) currently logs inserts; replace the `console.log` with a Drizzle insert to persist history.

---

## Assumptions & Limitations

- **Single broker** — Kafka runs as a single cluster (no Zookeeper).
- **No HTTPS** — TLS must be added before any public deployment; the `secure` cookie flag is only set when `NODE_ENV=production`.
- **No token refresh** — The `id_token` expires after 1 hour with no refresh mechanism.
- **Location history is not persisted** — the DB processor simulates logging only. A real insert requires a `location_history` table and schema migration.
- **No rate limiting** — Socket.IO events have no rate-limiting.
- **Geolocation accuracy** — depends entirely on the browser/device and Leaflet; no server-side validation of coordinate ranges.
