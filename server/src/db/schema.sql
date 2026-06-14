-- SafeTrack Database Schema v2
-- Neon Serverless Postgres

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('parent', 'child', 'guardian')),
  display_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Child profiles
CREATE TABLE IF NOT EXISTS child_profiles (
  id SERIAL PRIMARY KEY,
  parent_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  photo_url VARCHAR(255),
  pairing_token VARCHAR(64) UNIQUE NOT NULL,
  indicator_style VARCHAR(20) DEFAULT 'banner_map' CHECK (indicator_style IN ('banner_map', 'badge')),
  update_interval_s INT DEFAULT 10 CHECK (update_interval_s > 0),
  age_tier VARCHAR(20) DEFAULT 'under13' CHECK (age_tier IN ('under13', 'teen', 'older')),
  autonomy_level INT DEFAULT 1 CHECK (autonomy_level BETWEEN 1 AND 5),
  discreet_sos_enabled BOOLEAN DEFAULT false,
  routine_tracking_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Guardian roles (multi-guardian with scoped permissions + time-boxing)
CREATE TABLE IF NOT EXISTS guardian_roles (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type VARCHAR(30) NOT NULL CHECK (role_type IN ('primary_parent', 'secondary_parent', 'grandparent', 'babysitter', 'relative', 'carpool')),
  can_track BOOLEAN DEFAULT true,
  can_manage_contacts BOOLEAN DEFAULT false,
  can_manage_geofences BOOLEAN DEFAULT false,
  can_receive_alerts BOOLEAN DEFAULT true,
  time_window_start TIME,
  time_window_end TIME,
  active_days INT[] DEFAULT '{0,1,2,3,4,5,6}',
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(child_id, user_id)
);

-- Trusted contacts
CREATE TABLE IF NOT EXISTS trusted_contacts (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  relationship VARCHAR(50),
  priority INT DEFAULT 1,
  notify_on JSONB DEFAULT '{"sos":true,"geofence":true,"low_battery":true,"offline":true,"no_arrival":false}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tracking sessions
CREATE TABLE IF NOT EXISTS tracking_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  started_by VARCHAR(20) NOT NULL CHECK (started_by IN ('parent', 'child', 'guardian')),
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  paused BOOLEAN DEFAULT false,
  paused_at TIMESTAMP,
  paused_by VARCHAR(20),
  consent_acked_at TIMESTAMP,
  last_consent_check TIMESTAMP,
  consent_check_interval_min INT DEFAULT 60,
  is_discreet BOOLEAN DEFAULT false
);

-- Live locations
CREATE TABLE IF NOT EXISTS live_locations (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES tracking_sessions(session_id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  location_source VARCHAR(20) DEFAULT 'gps' CHECK (location_source IN ('gps', 'network', 'ip', 'manual')),
  battery_level INT CHECK (battery_level >= 0 AND battery_level <= 100),
  battery_charging BOOLEAN,
  network_type VARCHAR(20),
  signal_strength VARCHAR(20),
  is_online BOOLEAN DEFAULT true,
  timezone VARCHAR(50),
  screen_width INT,
  screen_height INT,
  ip_city VARCHAR(100),
  ip_country VARCHAR(100),
  speed_ms DOUBLE PRECISION,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Geofences
CREATE TABLE IF NOT EXISTS geofences (
  id SERIAL PRIMARY KEY,
  parent_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_m INT NOT NULL CHECK (radius_m > 0),
  is_safe BOOLEAN DEFAULT true,
  schedule_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  message VARCHAR(255) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_by VARCHAR(50),
  auto_escalated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Consent log (append-only audit trail)
CREATE TABLE IF NOT EXISTS consent_log (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  event VARCHAR(50) NOT NULL,
  actor VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Check-ins
CREATE TABLE IF NOT EXISTS check_ins (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('ok', 'help', 'no_response', 'auto_escalated')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  message VARCHAR(255),
  requested_by INT REFERENCES users(id),
  responded_at TIMESTAMP,
  escalation_deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trips
CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  destination_name VARCHAR(100),
  expected_arrival TIMESTAMP,
  distance_m DOUBLE PRECISION,
  eta_minutes INT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'arrived', 'overdue', 'cancelled')),
  auto_sos_fired BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Routines (learned patterns)
CREATE TABLE IF NOT EXISTS routines (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  routine_type VARCHAR(30) NOT NULL CHECK (routine_type IN ('commute', 'school', 'activity', 'custom')),
  expected_lat DOUBLE PRECISION,
  expected_lng DOUBLE PRECISION,
  expected_radius_m INT DEFAULT 200,
  expected_arrive_time TIME,
  expected_leave_time TIME,
  active_days INT[] DEFAULT '{1,2,3,4,5}',
  geofence_id INT REFERENCES geofences(id) ON DELETE SET NULL,
  deviation_threshold_min INT DEFAULT 15,
  learned_from_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  child_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Routine deviations (anomaly log)
CREATE TABLE IF NOT EXISTS routine_deviations (
  id SERIAL PRIMARY KEY,
  routine_id INT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  deviation_type VARCHAR(30) NOT NULL CHECK (deviation_type IN ('late_arrival', 'missed_arrival', 'unexpected_location', 'early_departure')),
  expected_time TIMESTAMP,
  actual_time TIMESTAMP,
  actual_lat DOUBLE PRECISION,
  actual_lng DOUBLE PRECISION,
  alerted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Daily digest
CREATE TABLE IF NOT EXISTS daily_digests (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  digest_date DATE NOT NULL,
  summary_json JSONB NOT NULL,
  sent_to INT[],
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(child_id, digest_date)
);

-- Heartbeat pings (two-way "I'm thinking of you")
CREATE TABLE IF NOT EXISTS heartbeat_pings (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  sender_id INT NOT NULL REFERENCES users(id),
  sender_role VARCHAR(20) NOT NULL,
  message VARCHAR(100),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pickup confirmations
CREATE TABLE IF NOT EXISTS pickup_confirmations (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  pickup_person VARCHAR(100) NOT NULL,
  pickup_person_contact VARCHAR(50),
  assigned_by INT NOT NULL REFERENCES users(id),
  child_confirmed BOOLEAN DEFAULT false,
  child_confirmed_at TIMESTAMP,
  child_confirmed_lat DOUBLE PRECISION,
  child_confirmed_lng DOUBLE PRECISION,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Group trips (carpool)
CREATE TABLE IF NOT EXISTS group_trips (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_by INT NOT NULL REFERENCES users(id),
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  destination_name VARCHAR(100),
  starts_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Group trip members
CREATE TABLE IF NOT EXISTS group_trip_members (
  id SERIAL PRIMARY KEY,
  group_trip_id INT NOT NULL REFERENCES group_trips(id) ON DELETE CASCADE,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_trip_id, child_id)
);

-- Live SOS links (shareable emergency tracking)
CREATE TABLE IF NOT EXISTS live_sos_links (
  id SERIAL PRIMARY KEY,
  alert_id INT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES tracking_sessions(session_id) ON DELETE CASCADE,
  share_token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  view_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settings change log (tamper detection)
CREATE TABLE IF NOT EXISTS settings_audit (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  changed_by INT NOT NULL REFERENCES users(id),
  change_type VARCHAR(50) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- APP & WEBSITE MONITORING (Privacy-first, safety-only)
-- ============================================================
-- Rules: Only domains (not full URLs), only app names (not content),
-- categorized, time-bounded (30-day auto-delete), child-visible,
-- explicit consent required, no keystroke/screenshot/content capture.

-- Website usage log (web tracker reports domains only)
CREATE TABLE IF NOT EXISTS website_usage (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  domain VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  category VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (category IN ('social_media', 'messaging', 'games', 'video', 'education', 'news', 'shopping', 'search', 'adult_flag', 'gaming', 'other')),
  duration_seconds INT DEFAULT 0,
  visited_at TIMESTAMP DEFAULT NOW(),
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- App usage log (native app reports app name + category)
CREATE TABLE IF NOT EXISTS app_usage (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  app_name VARCHAR(100) NOT NULL,
  app_package VARCHAR(255),
  category VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (category IN ('social_media', 'messaging', 'games', 'video', 'education', 'productivity', 'browser', 'system', 'adult_flag', 'gaming', 'other')),
  duration_seconds INT DEFAULT 0,
  is_foreground BOOLEAN DEFAULT true,
  used_at TIMESTAMP DEFAULT NOW(),
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Screen time rules (parent-configured limits)
CREATE TABLE IF NOT EXISTS screen_time_rules (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN ('daily_limit', 'category_limit', 'app_limit', 'bedtime', 'homework_time')),
  target VARCHAR(100),
  limit_minutes INT,
  start_time TIME,
  end_time TIME,
  active_days INT[] DEFAULT '{0,1,2,3,4,5,6}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Screen time violations
CREATE TABLE IF NOT EXISTS screen_time_violations (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  rule_id INT REFERENCES screen_time_rules(id) ON DELETE SET NULL,
  violation_type VARCHAR(30) NOT NULL CHECK (violation_type IN ('limit_exceeded', 'bedtime_violation', 'blocked_app_used', 'suspicious_content')),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Content safety flags (suspicious patterns detected)
CREATE TABLE IF NOT EXISTS content_flags (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  flag_type VARCHAR(30) NOT NULL CHECK (flag_type IN ('suspicious_contact', 'harmful_keyword', 'adult_content', 'cyberbullying', 'self_harm', 'excessive_usage')),
  source VARCHAR(30) NOT NULL CHECK (source IN ('website', 'app', 'message_pattern', 'usage_pattern')),
  source_detail VARCHAR(255),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Monitoring consent (separate from location consent)
CREATE TABLE IF NOT EXISTS monitoring_consent (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  consent_type VARCHAR(30) NOT NULL CHECK (consent_type IN ('website_monitoring', 'app_monitoring', 'screen_time', 'content_safety')),
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMP,
  revoked_at TIMESTAMP,
  actor VARCHAR(20) NOT NULL CHECK (actor IN ('child', 'parent', 'system')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Blocked apps/sites list
CREATE TABLE IF NOT EXISTS blocked_items (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('app', 'website')),
  item_value VARCHAR(255) NOT NULL,
  reason VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Monitoring config per child
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT false;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS website_monitoring BOOLEAN DEFAULT false;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS app_monitoring BOOLEAN DEFAULT false;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS screen_time_enabled BOOLEAN DEFAULT false;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS content_safety_enabled BOOLEAN DEFAULT false;

-- Indexes for monitoring
CREATE INDEX IF NOT EXISTS idx_website_usage_child ON website_usage(child_id);
CREATE INDEX IF NOT EXISTS idx_website_usage_visited ON website_usage(visited_at);
CREATE INDEX IF NOT EXISTS idx_website_usage_domain ON website_usage(domain);
CREATE INDEX IF NOT EXISTS idx_app_usage_child ON app_usage(child_id);
CREATE INDEX IF NOT EXISTS idx_app_usage_used ON app_usage(used_at);
CREATE INDEX IF NOT EXISTS idx_app_usage_app ON app_usage(app_name);
CREATE INDEX IF NOT EXISTS idx_screen_time_rules_child ON screen_time_rules(child_id);
CREATE INDEX IF NOT EXISTS idx_screen_time_violations_child ON screen_time_violations(child_id);
CREATE INDEX IF NOT EXISTS idx_content_flags_child ON content_flags(child_id);
CREATE INDEX IF NOT EXISTS idx_content_flags_unresolved ON content_flags(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_monitoring_consent_child ON monitoring_consent(child_id);
CREATE INDEX IF NOT EXISTS idx_blocked_items_child ON blocked_items(child_id);
