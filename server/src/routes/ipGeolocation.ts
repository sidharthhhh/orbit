import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { validateBody } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { ipLocationSchema } from '../utils/schemas.js';
import { getSocketIO } from '../socket/index.js';

const router = Router();

interface IPLocationResponse {
  status: string;
  lat: number;
  lon: number;
  city: string;
  country: string;
  regionName: string;
  isp: string;
  org: string;
  as: string;
  query: string;
}

// IP geolocation endpoint - uses ip-api.com (free tier)
// WARNING: This breaks the "No IP geolocation" rule but is implemented with transparency
router.post(
  '/locate',
  rateLimit({ windowMs: 60_000, max: 10, name: 'ip-locate' }),
  validateBody(ipLocationSchema),
  async (req: Request, res: Response) => {
    try {
      const { session_id, child_id } = req.body;

      // Verify session is active
      const session = await query(
        `SELECT ts.*, cp.parent_id, cp.id as profile_id FROM tracking_sessions ts 
         JOIN child_profiles cp ON ts.child_id = cp.id 
         WHERE ts.session_id = $1 AND ts.is_active = true`,
        [session_id]
      );
      if (session.length === 0) {
        return res.status(404).json({ error: 'No active session' });
      }

      // Get client IP (handle proxies)
      const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                       req.headers['x-real-ip']?.toString() ||
                       req.socket.remoteAddress ||
                       '';

      // Skip if local/private IP
      if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.')) {
        return res.status(400).json({ 
          error: 'Cannot geolocate local/private IP',
          message: 'IP geolocation only works with public IP addresses'
        });
      }

      // Call ip-api.com
      const apiUrl = `http://ip-api.com/json/${clientIp}?fields=status,lat,lon,city,country,regionName,isp,org,as,query`;
      const apiResponse = await fetch(apiUrl);
      
      if (!apiResponse.ok) {
        throw new Error(`IP API returned ${apiResponse.status}`);
      }

      const ipData: IPLocationResponse = await apiResponse.json();

      if (ipData.status !== 'success') {
        return res.status(400).json({ 
          error: 'IP geolocation failed',
          message: 'Could not determine location from IP address'
        });
      }

      // Insert location with source='ip'
      const result = await query(
        `INSERT INTO live_locations (
          session_id, latitude, longitude, accuracy_m, location_source,
          battery_level, battery_charging, network_type, is_online,
          timezone, screen_width, screen_height, ip_city, ip_country
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          session_id,
          ipData.lat,
          ipData.lon,
          5000, // IP geolocation is ~city-level accuracy (~5km)
          'ip',
          null, // battery not available via IP
          null,
          null,
          true,
          null,
          null,
          null,
          ipData.city,
          ipData.country,
        ]
      );

      const location = result[0];
      const childId = session[0].profile_id;

      // Broadcast to parent room with IP source indicator
      const io = getSocketIO();
      if (io) {
        io.to(`child_${childId}`).emit('location:update', {
          child_id: childId,
          session_id,
          location,
          is_ip_location: true, // Flag for parent dashboard to show warning
          ip_accuracy_warning: `Approximate location based on IP address (${ipData.city}, ${ipData.country}). Accuracy: ~5km radius.`,
        });
      }

      // Log that IP geolocation was used in consent log
      await query(
        `INSERT INTO consent_log (child_id, session_id, event, actor, metadata) 
         VALUES ($1, $2, 'ip_geolocation_used', 'system', $3)`,
        [
          childId,
          session_id,
          JSON.stringify({
            source: 'ip',
            city: ipData.city,
            country: ipData.country,
            accuracy_m: 5000,
            warning: 'IP geolocation provides approximate city-level location only',
          }),
        ]
      );

      res.json({
        location,
        is_ip_location: true,
        warning: 'This location is approximate (city-level) based on IP address',
        accuracy_note: 'IP geolocation accuracy is typically 1-5km radius',
        city: ipData.city,
        country: ipData.country,
      });
    } catch (err) {
      console.error('IP geolocation error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
