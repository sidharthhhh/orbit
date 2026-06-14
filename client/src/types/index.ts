export interface User {
  id: number;
  email: string;
  role: 'parent' | 'child' | 'guardian';
  display_name: string;
}

export interface ChildProfile {
  id: number;
  parent_id: number;
  name: string;
  photo_url: string | null;
  pairing_token: string;
  indicator_style: 'banner_map' | 'badge';
  update_interval_s: number;
  age_tier: 'under13' | 'teen' | 'older';
  autonomy_level: number;
  discreet_sos_enabled: boolean;
  routine_tracking_enabled: boolean;
  created_at: string;
  last_location?: LiveLocation | null;
  is_tracking?: boolean;
}

export interface TrustedContact {
  id: number;
  child_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  priority: number;
  notify_on: { sos: boolean; geofence: boolean; low_battery: boolean; offline: boolean; no_arrival: boolean };
  created_at: string;
}

export interface TrackingSession {
  session_id: string;
  child_id: number;
  started_by: 'parent' | 'child' | 'guardian';
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  paused: boolean;
  paused_at: string | null;
  paused_by: string | null;
  consent_acked_at: string | null;
  last_consent_check: string | null;
  consent_check_interval_min: number;
  is_discreet: boolean;
}

export interface LiveLocation {
  id: number;
  session_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  location_source: 'gps' | 'network' | 'ip' | 'manual';
  battery_level: number | null;
  battery_charging: boolean | null;
  network_type: string | null;
  signal_strength: string | null;
  is_online: boolean;
  timezone: string | null;
  screen_width: number | null;
  screen_height: number | null;
  ip_city: string | null;
  ip_country: string | null;
  speed_ms: number | null;
  recorded_at: string;
}

export interface Geofence {
  id: number;
  parent_id: number;
  child_id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_safe: boolean;
  schedule_json: any;
  created_at: string;
}

export interface Alert {
  id: number;
  session_id: string | null;
  child_id: number;
  alert_type: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolved_by: string | null;
  auto_escalated: boolean;
  created_at: string;
  child_name?: string;
}

export interface ConsentLogEntry {
  id: number;
  child_id: number;
  session_id: string | null;
  event: string;
  actor: string;
  metadata: any;
  created_at: string;
}

export interface CheckIn {
  id: number;
  session_id: string | null;
  child_id: number;
  status: 'ok' | 'help' | 'no_response' | 'auto_escalated';
  lat: number | null;
  lng: number | null;
  message: string | null;
  requested_by: number | null;
  responded_at: string | null;
  escalation_deadline: string | null;
  created_at: string;
}

export interface Trip {
  id: number;
  child_id: number;
  session_id: string | null;
  destination_lat: number;
  destination_lng: number;
  destination_name: string | null;
  expected_arrival: string | null;
  distance_m: number | null;
  eta_minutes: number | null;
  status: 'active' | 'arrived' | 'overdue' | 'cancelled';
  auto_sos_fired: boolean;
  created_at: string;
}

export interface Routine {
  id: number;
  child_id: number;
  name: string;
  routine_type: 'commute' | 'school' | 'activity' | 'custom';
  expected_lat: number | null;
  expected_lng: number | null;
  expected_radius_m: number;
  expected_arrive_time: string | null;
  expected_leave_time: string | null;
  active_days: number[];
  geofence_id: number | null;
  deviation_threshold_min: number;
  learned_from_count: number;
  is_active: boolean;
  child_visible: boolean;
  created_at: string;
}

export interface GuardianRole {
  id: number;
  child_id: number;
  user_id: number;
  role_type: string;
  can_track: boolean;
  can_manage_contacts: boolean;
  can_manage_geofences: boolean;
  can_receive_alerts: boolean;
  time_window_start: string | null;
  time_window_end: string | null;
  active_days: number[];
  expires_at: string | null;
  email?: string;
  display_name?: string;
}

export interface HeartbeatPing {
  id: number;
  child_id: number;
  sender_id: number;
  sender_role: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export interface PickupConfirmation {
  id: number;
  child_id: number;
  session_id: string | null;
  pickup_person: string;
  pickup_person_contact: string | null;
  assigned_by: number;
  child_confirmed: boolean;
  child_confirmed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface GroupTrip {
  id: number;
  name: string;
  created_by: number;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_name: string | null;
  starts_at: string;
  expires_at: string;
  status: string;
  child_ids: number[];
}

export interface DailyDigest {
  id: number;
  child_id: number;
  digest_date: string;
  summary_json: any;
}

export interface LiveSOSLink {
  token: string;
  child_name: string;
  session_id: string;
  location: LiveLocation | null;
  created_at: string;
  view_count: number;
}
