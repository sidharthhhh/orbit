# SafeTrack

A production-quality parental-safety web app where a child's device shares **live location and safety-relevant device context** with a parent/guardian **only under explicit, ongoing, visible consent**.

## 🛡️ Three Non-Negotiable Rules

1. **No Auto-Tracking**: Opening the page sends no data. Location and device context only flow after the child taps "Share My Location" and the browser grants permission.
2. **Always-Visible Indicator**: While sharing is active, the child's screen always shows a non-removable, non-dismissible indicator (banner with mini-map or badge with pulse).
3. **No Covert Collection**: No IP geolocation, no fingerprinting, no hidden scripts, no background tracking without the indicator.

## 🏗️ Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite + TailwindCSS + Leaflet + Socket.IO + React Query + Framer Motion |
| Backend | Node + Express + TypeScript + Socket.IO |
| Database | Neon Serverless Postgres (`@neondatabase/serverless`) |
| Auth | JWT in HTTP-only Secure cookies + bcrypt (cost 12) |
| Security | Helmet, rate limiting, Zod validation, CORS, append-only audit logging |

## 📦 Quick Start

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) Postgres database (free tier works)

### 1. Clone and install

```bash
# Install server dependencies
cd server
cp .env.example .env  # Edit with your Neon connection string
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Set up the database

```bash
cd server
npm run migrate
```

This creates all required tables in your Neon database.

### 3. Configure environment

Edit `server/.env`:

```env
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=generate-a-strong-random-string-here
PORT=3001
CLIENT_URL=http://localhost:5173
```

### 4. Run

```bash
# Terminal 1: Start server
cd server
npm run dev

# Terminal 2: Start client
cd client
npm run dev
```

Open http://localhost:5173 in your browser.

## 📊 Data Model

### What We Collect (and Why)

| Field | Safety Justification |
|-------|---------------------|
| `latitude`, `longitude` | Core safety feature: locate the child |
| `accuracy_m` | Improves location reliability |
| `battery_level` | Predicts if device will die (safety risk) |
| `battery_charging` | Indicates if battery is being replenished |
| `network_type` | Detects connectivity issues |
| `is_online` | Critical for knowing if child is reachable |
| `timezone` | Helps parents interpret timestamps correctly |
| `screen_width/height` | UI scaling (no safety use, but harmless) |

### What We Do NOT Collect

- WebGL/canvas data
- GPU information
- Browser plugins or MIME types
- CPU core counts
- Device memory
- Full user-agent strings
- IP geolocation
- Any hardware fingerprints

## 🔐 Consent Model

### Child's Experience

1. **On Load**: No data sent. Only reads coarse device info to pre-fill the consent card.
2. **Consent Card**: Shows exactly what will be shared, in child-friendly language.
3. **"Share My Location"**: Requests geolocation permission, battery API, network info, timezone.
4. **Persistent Indicator**: Always visible while sharing is active.
5. **Controls**: Pause, Resume, Stop, SOS — all at the child's fingertips.
6. **Background Tab**: Shows "Still sharing location" toast on return.

### Parent's Experience

1. **Map View**: Dark-themed OpenStreetMap with animated child markers.
2. **Side Panel**: Live battery, network, timezone, accuracy stats.
3. **Consent History**: Full audit trail of opt_in, pause, resume, stop events.
4. **Alerts**: Geofence, low battery, offline, SOS — with severity levels.

## 🌐 API Endpoints

### Auth
- `POST /api/auth/register` — Create parent/guardian account
- `POST /api/auth/login` — Login (sets HTTP-only cookie)
- `POST /api/auth/logout` — Logout (clears cookie)
- `GET /api/auth/me` — Get current user

### Children
- `GET /api/children` — List parent's children
- `POST /api/children` — Add a child
- `PUT /api/children/:id` — Update child profile
- `DELETE /api/children/:id` — Remove child
- `POST /api/children/:id/pair` — Rotate pairing token
- `POST /api/children/pair` — Child pairs using token

### Sessions
- `POST /api/sessions/start` — Start tracking session
- `POST /api/sessions/pause` — Pause session
- `POST /api/sessions/resume` — Resume session
- `POST /api/sessions/stop` — End session

### Locations
- `POST /api/locations` — Ingest live location data
- `GET /api/locations/latest/:childId` — Get latest location
- `GET /api/locations/history/:childId` — Get location history

### Geofences
- `GET /api/geofences` — List geofences
- `POST /api/geofences` — Create geofence
- `PUT /api/geofences/:id` — Update geofence
- `DELETE /api/geofences/:id` — Delete geofence

### Alerts
- `GET /api/alerts` — List alerts
- `PUT /api/alerts/:id/resolve` — Resolve alert

### Check-ins
- `POST /api/checkins/request` — Request check-in from child
- `POST /api/checkins/respond` — Child responds to check-in
- `GET /api/checkins` — List check-ins

### Trips
- `POST /api/trips` — Create trip
- `POST /api/trips/:id/arrive` — Mark arrived
- `POST /api/trips/:id/cancel` — Cancel trip
- `GET /api/trips` — List trips

### Consent
- `GET /api/consent` — Get consent audit log

### Privacy
- `POST /api/privacy/forget` — Delete session + cascading data
- `POST /api/privacy/forget-child` — Delete child + all data

## 🔒 Security Features

- **JWT in HTTP-only Secure cookies** — No token exposure to JavaScript
- **bcrypt with cost 12** — Strong password hashing
- **Parameterized queries only** — SQL injection prevention
- **Zod validation** — Every request body/param validated
- **Rate limiting** — Per-route limits to prevent abuse
- **CORS** — Strict origin validation
- **Helmet** — Security headers
- **Append-only audit log** — Consent changes are immutable

## 📋 COPPA/GDPR-K Compliance Notes

### COPPA Considerations

- **Verifiable Parental Consent**: The app requires parent registration and explicit child pairing via token.
- **Data Minimization**: Only safety-relevant fields are collected, with clear justification for each.
- **Parental Control**: Parents can delete all child data at any time via `/api/privacy/forget-child`.
- **No Behavioral Advertising**: No data is shared with third parties.

### GDPR-K Considerations

- **Right to Erasure**: Full data deletion endpoints provided.
- **Data Portability**: Location history can be exported via API.
- **Transparency**: Consent log provides full audit trail.
- **Lawful Basis**: Legitimate interest in child safety, with explicit consent from parent.

## 🚀 Deployment

### Server

```bash
cd server
npm run build
# Deploy dist/ to your hosting provider
# Set environment variables in production
```

### Client

```bash
cd client
npm run build
# Deploy dist/ to Vercel, Netlify, or any static host
```

### Tracker (Child View)

The `tracker/index.html` is a standalone file that can be:
- Hosted on any static server
- Embedded in an iframe
- Served from the same backend

Configure via URL parameters or global variables:
```javascript
window.SAFETRACK_API = 'https://api.example.com';
window.SAFETRACK_CHILD_ID = 123;
window.SAFETRACK_SESSION_ID = 'uuid-here';
window.SAFETRACK_INDICATOR = 'banner_map'; // or 'badge'
window.SAFETRACK_INTERVAL = 10; // seconds
```

## 📁 Project Structure

```
SafeTrack/
├── server/
│   ├── src/
│   │   ├── index.ts              # Express + Socket.IO entry
│   │   ├── db/
│   │   │   ├── schema.sql        # Full database schema
│   │   │   ├── connection.ts     # Neon connection
│   │   │   └── migrations.ts     # Run schema
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT auth + roles
│   │   │   ├── rateLimit.ts      # Per-route rate limiting
│   │   │   └── validate.ts       # Zod validation
│   │   ├── routes/
│   │   │   ├── auth.ts           # Login/register/logout
│   │   │   ├── children.ts       # Child CRUD + pairing
│   │   │   ├── contacts.ts       # Trusted contacts
│   │   │   ├── sessions.ts       # Start/pause/resume/stop
│   │   │   ├── locations.ts      # Location ingest
│   │   │   ├── geofences.ts      # Geofence CRUD
│   │   │   ├── alerts.ts         # Alert management
│   │   │   ├── checkins.ts       # Check-in requests
│   │   │   ├── trips.ts          # Trip management
│   │   │   ├── consent.ts        # Consent audit log
│   │   │   └── privacy.ts        # Data deletion
│   │   ├── services/
│   │   │   ├── geofence.ts       # Geofence evaluation
│   │   │   └── alerts.ts         # Alert triggers
│   │   ├── socket/
│   │   │   └── index.ts          # Socket.IO setup
│   │   ├── jobs/
│   │   │   └── scheduler.ts      # Cron jobs
│   │   └── utils/
│   │       └── schemas.ts        # Zod schemas
│   ├── package.json
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── main.tsx              # React entry
│   │   ├── App.tsx               # Router
│   │   ├── components/
│   │   │   ├── Dashboard.tsx     # Main dashboard
│   │   │   ├── SidePanel.tsx     # Child details
│   │   │   ├── auth/
│   │   │   │   └── LoginPage.tsx
│   │   │   ├── map/
│   │   │   │   └── MapView.tsx   # Leaflet map
│   │   │   ├── children/
│   │   │   │   ├── ChildrenRail.tsx
│   │   │   │   └── AddChildModal.tsx
│   │   │   └── alerts/
│   │   │       └── AlertsPanel.tsx
│   │   ├── context/
│   │   │   ├── AuthContext.tsx
│   │   │   └── SocketContext.tsx
│   │   ├── lib/
│   │   │   └── api.ts            # API client
│   │   └── types/
│   │       └── index.ts          # TypeScript types
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── tracker/
│   └── index.html                # Standalone child tracker
└── README.md
```

## 📄 License

MIT
