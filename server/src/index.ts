import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initSocket } from './socket/index.js';
import { startScheduledJobs } from './jobs/scheduler.js';
import authRoutes from './routes/auth.js';
import childrenRoutes from './routes/children.js';
import contactsRoutes from './routes/contacts.js';
import sessionsRoutes from './routes/sessions.js';
import locationsRoutes from './routes/locations.js';
import geofencesRoutes from './routes/geofences.js';
import alertsRoutes from './routes/alerts.js';
import checkinsRoutes from './routes/checkins.js';
import tripsRoutes from './routes/trips.js';
import privacyRoutes from './routes/privacy.js';
import consentRoutes from './routes/consent.js';
import ipGeolocationRoutes from './routes/ipGeolocation.js';
import discreetSosRoutes from './routes/discreetSos.js';
import advancedRoutes from './routes/advanced.js';
import monitoringRoutes from './routes/monitoring.js';
import { setupSwagger } from './swagger.js';

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const TRACKER_ORIGINS = (process.env.TRACKER_ORIGINS || '').split(',').filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", CLIENT_URL, ...TRACKER_ORIGINS],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https://*.basemaps.cartocdn.com", "https://*.tile.openstreetmap.org"],
      fontSrc: ["'self'"],
    },
  },
}));

const dashboardCors = cors({ origin: CLIENT_URL, credentials: true });
const trackerCors = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (TRACKER_ORIGINS.includes(origin) || origin === CLIENT_URL) return callback(null, true);
    if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:') || origin.startsWith('http://127.0.0.1:')) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Dashboard routes (strict CORS)
app.use('/api/auth', dashboardCors, authRoutes);
app.use('/api/contacts', dashboardCors, contactsRoutes);
app.use('/api/sessions', dashboardCors, sessionsRoutes);
app.use('/api/geofences', dashboardCors, geofencesRoutes);
app.use('/api/privacy', dashboardCors, privacyRoutes);
app.use('/api/trips', dashboardCors, tripsRoutes);
app.use('/api/advanced', dashboardCors, advancedRoutes);
app.use('/api/monitoring', dashboardCors, monitoringRoutes);

// Tracker routes (cross-origin allowed)
app.use('/api/children', trackerCors, childrenRoutes);
app.use('/api/locations', trackerCors, locationsRoutes);
app.use('/api/alerts', trackerCors, alertsRoutes);
app.use('/api/checkins', trackerCors, checkinsRoutes);
app.use('/api/consent', trackerCors, consentRoutes);
app.use('/api/ip-location', trackerCors, ipGeolocationRoutes);
app.use('/api/discreet', trackerCors, discreetSosRoutes);
app.use('/api/monitoring', trackerCors, monitoringRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

setupSwagger(app);

initSocket(httpServer);
startScheduledJobs();

httpServer.listen(PORT, () => {
  console.log(`SafeTrack server running on port ${PORT}`);
  console.log(`Dashboard origin: ${CLIENT_URL}`);
  if (TRACKER_ORIGINS.length) console.log(`Tracker origins: ${TRACKER_ORIGINS.join(', ')}`);
});

export { app, httpServer };
