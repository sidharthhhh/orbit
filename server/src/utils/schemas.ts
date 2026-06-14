import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['parent', 'guardian']),
  display_name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createChildSchema = z.object({
  name: z.string().min(1).max(100),
  photo_url: z.string().url().optional(),
  indicator_style: z.enum(['banner_map', 'badge']).default('banner_map'),
  update_interval_s: z.number().int().min(5).max(120).default(10),
});

export const updateChildSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  photo_url: z.string().url().optional(),
  indicator_style: z.enum(['banner_map', 'badge']).optional(),
  update_interval_s: z.number().int().min(5).max(120).optional(),
});

export const createContactSchema = z.object({
  child_id: z.number().int(),
  name: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  relationship: z.string().max(50).optional(),
  priority: z.number().int().min(1).max(10).default(1),
  notify_on: z.object({
    sos: z.boolean().default(true),
    geofence: z.boolean().default(true),
    low_battery: z.boolean().default(true),
    offline: z.boolean().default(true),
    no_arrival: z.boolean().default(false),
  }).default({}),
});

export const updateContactSchema = createContactSchema.partial().omit({ child_id: true });

export const startSessionSchema = z.object({
  child_id: z.number().int(),
  started_by: z.enum(['parent', 'child', 'guardian']),
});

export const pauseSessionSchema = z.object({
  session_id: z.string().uuid(),
  paused_by: z.enum(['child', 'parent']),
});

export const resumeSessionSchema = z.object({
  session_id: z.string().uuid(),
});

export const stopSessionSchema = z.object({
  session_id: z.string().uuid(),
});

export const locationSchema = z.object({
  session_id: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).optional(),
  location_source: z.enum(['gps', 'network', 'ip', 'manual']).default('gps'),
  battery_level: z.number().int().min(0).max(100).optional(),
  battery_charging: z.boolean().optional(),
  network_type: z.enum(['wifi', '4g', '5g', '3g', '2g', 'ethernet', 'offline', 'other']).optional(),
  is_online: z.boolean().default(true),
  timezone: z.string().max(50).optional(),
  screen_width: z.number().int().optional(),
  screen_height: z.number().int().optional(),
  ip_city: z.string().max(100).optional(),
  ip_country: z.string().max(100).optional(),
});

export const ipLocationSchema = z.object({
  session_id: z.string().uuid(),
  child_id: z.number().int(),
});

export const createGeofenceSchema = z.object({
  child_id: z.number().int(),
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_m: z.number().int().min(10).max(50000),
  is_safe: z.boolean().default(true),
  schedule_json: z.any().optional(),
});

export const updateGeofenceSchema = createGeofenceSchema.partial().omit({ child_id: true });

export const resolveAlertSchema = z.object({
  resolved_by: z.string().max(50),
});

export const requestCheckinSchema = z.object({
  child_id: z.number().int(),
  session_id: z.string().uuid(),
});

export const respondCheckinSchema = z.object({
  checkin_id: z.number().int(),
  status: z.enum(['ok', 'help']),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  message: z.string().max(255).optional(),
});

export const createTripSchema = z.object({
  child_id: z.number().int(),
  session_id: z.string().uuid(),
  destination_lat: z.number().min(-90).max(90),
  destination_lng: z.number().min(-180).max(180),
  destination_name: z.string().max(100).optional(),
  expected_arrival: z.string().datetime().optional(),
});

export const pairSchema = z.object({
  token: z.string().min(1),
  child_user_name: z.string().min(1).max(100).optional(),
});
