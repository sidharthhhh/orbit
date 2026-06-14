import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createContactSchema, updateContactSchema } from '../utils/schemas.js';

const router = Router();

router.get('/', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const childId = req.query.child_id;
    if (!childId) return res.status(400).json({ error: 'child_id required' });
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query('SELECT * FROM trusted_contacts WHERE child_id = $1 ORDER BY priority', [childId]);
    res.json({ contacts: result });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, requireRole('parent', 'guardian'), validateBody(createContactSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, name, phone, email, relationship, priority, notify_on } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query(
      `INSERT INTO trusted_contacts (child_id, name, phone, email, relationship, priority, notify_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [child_id, name, phone || null, email || null, relationship || null, priority, JSON.stringify(notify_on)]
    );
    res.status(201).json({ contact: result[0] });
  } catch (err) {
    console.error('Create contact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireAuth, requireRole('parent', 'guardian'), validateBody(updateContactSchema), async (req: Request, res: Response) => {
  try {
    const contact = await query(
      `SELECT tc.id FROM trusted_contacts tc JOIN child_profiles cp ON tc.child_id = cp.id WHERE tc.id = $1 AND cp.parent_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (contact.length === 0) return res.status(404).json({ error: 'Contact not found' });

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        const dbVal = key === 'notify_on' ? JSON.stringify(val) : val;
        fields.push(`${key} = $${idx}`);
        values.push(dbVal);
        idx++;
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const result = await query(`UPDATE trusted_contacts SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    res.json({ contact: result[0] });
  } catch (err) {
    console.error('Update contact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM trusted_contacts tc USING child_profiles cp WHERE tc.child_id = cp.id AND tc.id = $1 AND cp.parent_id = $2 RETURNING tc.id`,
      [req.params.id, req.user!.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete contact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
