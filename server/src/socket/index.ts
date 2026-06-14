import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';

let io: Server | null = null;

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const TRACKER_ORIGINS = (process.env.TRACKER_ORIGINS || '').split(',').filter(Boolean);

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        if (TRACKER_ORIGINS.includes(origin) || origin === clientUrl) return callback(null, true);
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:') || origin.startsWith('http://127.0.0.1:')) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 10000,
  });

  // Auth middleware for socket connections
  io.use((socket, next) => {
    console.log('Incoming socket connection attempt:', socket.handshake.auth);
    // Allow child tracker connections
    if (socket.handshake.auth?.child_id) {
      (socket as any).child_id = socket.handshake.auth.child_id;
      return next();
    }

    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.split('token=')[1]?.split(';')[0];
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    const childId = (socket as any).child_id;
    
    if (user) {
      console.log(`Socket connected: ${user.email} (${user.role})`);
    } else if (childId) {
      console.log(`Socket connected: Tracker for child ${childId}`);
      // Auto join child to their own room
      socket.join(`child_${childId}`);
      
      // Check if there is an active session for this child and notify them immediately
      query('SELECT * FROM tracking_sessions WHERE child_id = $1 AND is_active = true', [childId])
        .then(result => {
          if (result.length > 0) {
            socket.emit('session:started', { session: result[0] });
          }
        })
        .catch(err => console.error('Socket init session check error:', err));
    }

    // Join rooms for parent's children
    socket.on('join:child', (id: number) => {
      socket.join(`child_${id}`);
    });

    socket.on('leave:child', (id: number) => {
      socket.leave(`child_${id}`);
    });

    socket.on('disconnect', () => {
      if (user) {
        console.log(`Socket disconnected: ${user.email}`);
      } else if (childId) {
        console.log(`Socket disconnected: Tracker for child ${childId}`);
      }
    });
  });

  return io;
}

export function getSocketIO(): Server | null {
  return io;
}
