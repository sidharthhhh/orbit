import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { startSessionSchema, pauseSessionSchema, resumeSessionSchema, stopSessionSchema } from '../utils/schemas.js';
import { getSocketIO } from '../socket/index.js';

const router = Router();

/**
 * @swagger
 * /sessions/start:
 *   post:
 *     summary: Start a new tracking session for a child
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - child_id
 *               - started_by
 *             properties:
 *               child_id:
 *                 type: integer
 *               started_by:
 *                 type: string
 *     responses:
 *       201:
 *         description: Session started successfully
 *       404:
 *         description: Child not found
 */
router.post('/start', requireAuth, validateBody(startSessionSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, started_by } = req.body;

    // Verify access
    if (started_by === 'parent' || started_by === 'guardian') {
      const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
      if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    }

    // End any existing active sessions for this child
    await query(
      `UPDATE tracking_sessions SET is_active = false, ended_at = NOW() WHERE child_id = $1 AND is_active = true`,
      [child_id]
    );

    const result = await query(
      `INSERT INTO tracking_sessions (child_id, started_by) VALUES ($1, $2) RETURNING *`,
      [child_id, started_by]
    );

    const session = result[0];

    // Log consent
    await query(
      `INSERT INTO consent_log (child_id, session_id, event, actor) VALUES ($1, $2, 'opt_in', $3)`,
      [child_id, session.session_id, started_by]
    );

    // Notify via socket
    const io = getSocketIO();
    if (io) {
      io.to(`child_${child_id}`).emit('session:started', { session });
    }

    res.status(201).json({ session });
  } catch (err) {
    console.error('Start session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sessions/pause:
 *   post:
 *     summary: Pause an active tracking session
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *               - paused_by
 *             properties:
 *               session_id:
 *                 type: string
 *               paused_by:
 *                 type: string
 *     responses:
 *       200:
 *         description: Session paused successfully
 *       404:
 *         description: Session not found
 */
router.post('/pause', requireAuth, validateBody(pauseSessionSchema), async (req: Request, res: Response) => {
  try {
    const { session_id, paused_by } = req.body;
    const result = await query(
      `UPDATE tracking_sessions SET paused = true, paused_at = NOW(), paused_by = $1 WHERE session_id = $2 AND is_active = true RETURNING *`,
      [paused_by, session_id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Session not found or already ended' });

    const session = result[0];

    await query(
      `INSERT INTO consent_log (child_id, session_id, event, actor) VALUES ($1, $2, 'pause', $3)`,
      [session.child_id, session_id, paused_by]
    );

    const io = getSocketIO();
    if (io) {
      io.to(`child_${session.child_id}`).emit('session:paused', { session_id, paused_by });
    }

    res.json({ session });
  } catch (err) {
    console.error('Pause session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sessions/resume:
 *   post:
 *     summary: Resume a paused tracking session
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *             properties:
 *               session_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Session resumed successfully
 *       404:
 *         description: Session not found
 */
router.post('/resume', requireAuth, validateBody(resumeSessionSchema), async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    const result = await query(
      `UPDATE tracking_sessions SET paused = false, paused_at = NULL, paused_by = NULL WHERE session_id = $1 AND is_active = true RETURNING *`,
      [session_id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Session not found or already ended' });

    const session = result[0];

    await query(
      `INSERT INTO consent_log (child_id, session_id, event, actor) VALUES ($1, $2, 'resume', $3)`,
      [session.child_id, session_id, req.user!.role]
    );

    const io = getSocketIO();
    if (io) {
      io.to(`child_${session.child_id}`).emit('session:resumed', { session_id });
    }

    res.json({ session });
  } catch (err) {
    console.error('Resume session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sessions/stop:
 *   post:
 *     summary: Stop an active tracking session
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *             properties:
 *               session_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Session stopped successfully
 *       404:
 *         description: Session not found
 */
router.post('/stop', requireAuth, validateBody(stopSessionSchema), async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    const result = await query(
      `UPDATE tracking_sessions SET is_active = false, ended_at = NOW() WHERE session_id = $1 AND is_active = true RETURNING *`,
      [session_id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Session not found or already ended' });

    const session = result[0];

    await query(
      `INSERT INTO consent_log (child_id, session_id, event, actor) VALUES ($1, $2, 'stop', $3)`,
      [session.child_id, session_id, req.user!.role]
    );

    const io = getSocketIO();
    if (io) {
      io.to(`child_${session.child_id}`).emit('session:stopped', { session_id });
    }

    res.json({ session });
  } catch (err) {
    console.error('Stop session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
