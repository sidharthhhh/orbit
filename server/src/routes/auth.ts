import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/connection.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { registerSchema, loginSchema } from '../utils/schemas.js';

const router = Router();

router.post('/register', rateLimit({ windowMs: 60_000, max: 5, name: 'register' }), validateBody(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, role, display_name } = req.body;
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (email, password_hash, role, display_name) VALUES ($1, $2, $3, $4) RETURNING id, email, role, display_name, created_at',
      [email, password_hash, role, display_name]
    );
    const user = result[0];
    const token = signToken({ id: user.id, email: user.email, role: user.role, display_name: user.display_name });
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name } });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', rateLimit({ windowMs: 60_000, max: 10, name: 'login' }), validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT id, email, password_hash, role, display_name FROM users WHERE email = $1', [email]);
    if (result.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken({ id: user.id, email: user.email, role: user.role, display_name: user.display_name });
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name } });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
