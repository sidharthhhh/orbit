const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  register: (data: { email: string; password: string; role: string; display_name: string }) =>
    request<{ user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: any }>('/auth/me'),

  getChildren: () => request<{ children: any[] }>('/children'),
  getChild: (id: number) => request<{ child: any }>(`/children/${id}`),
  createChild: (data: any) => request<{ child: any }>('/children', { method: 'POST', body: JSON.stringify(data) }),
  updateChild: (id: number, data: any) => request<{ child: any }>(`/children/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteChild: (id: number) => request<{ ok: boolean }>(`/children/${id}`, { method: 'DELETE' }),
  pairChild: (token: string) => request<{ child_id: number; child_name: string }>('/children/pair', { method: 'POST', body: JSON.stringify({ token }) }),
  rotatePairToken: (id: number) => request<{ pairing_token: string }>(`/children/${id}/pair`, { method: 'POST' }),

  getContacts: (childId: number) => request<{ contacts: any[] }>(`/contacts?child_id=${childId}`),
  createContact: (data: any) => request<{ contact: any }>('/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id: number, data: any) => request<{ contact: any }>(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (id: number) => request<{ ok: boolean }>(`/contacts/${id}`, { method: 'DELETE' }),

  startSession: (data: { child_id: number; started_by: string }) =>
    request<{ session: any }>('/sessions/start', { method: 'POST', body: JSON.stringify(data) }),
  pauseSession: (data: { session_id: string; paused_by: string }) =>
    request<{ session: any }>('/sessions/pause', { method: 'POST', body: JSON.stringify(data) }),
  resumeSession: (session_id: string) =>
    request<{ session: any }>('/sessions/resume', { method: 'POST', body: JSON.stringify({ session_id }) }),
  stopSession: (session_id: string) =>
    request<{ session: any }>('/sessions/stop', { method: 'POST', body: JSON.stringify({ session_id }) }),

  getLatestLocation: (childId: number) => request<{ location: any; is_ip_location?: boolean; ip_warning?: string }>(`/locations/latest/${childId}`),
  getLocationHistory: (childId: number, limit?: number) =>
    request<{ locations: any[] }>(`/locations/history/${childId}?limit=${limit || 100}`),

  requestIPLocation: (data: { session_id: string; child_id: number }) =>
    request<any>('/ip-location/locate', { method: 'POST', body: JSON.stringify(data) }),

  getGeofences: (childId: number) => request<{ geofences: any[] }>(`/geofences?child_id=${childId}`),
  createGeofence: (data: any) => request<{ geofence: any }>('/geofences', { method: 'POST', body: JSON.stringify(data) }),
  updateGeofence: (id: number, data: any) => request<{ geofence: any }>(`/geofences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGeofence: (id: number) => request<{ ok: boolean }>(`/geofences/${id}`, { method: 'DELETE' }),

  getAlerts: (childId?: number) => request<{ alerts: any[] }>(`/alerts${childId ? `?child_id=${childId}` : ''}`),
  resolveAlert: (id: number, resolved_by: string) =>
    request<{ alert: any }>(`/alerts/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ resolved_by }) }),

  requestCheckin: (data: { child_id: number; session_id: string }) =>
    request<{ checkin: any }>('/checkins/request', { method: 'POST', body: JSON.stringify(data) }),
  respondCheckin: (data: any) => request<{ checkin: any }>('/checkins/respond', { method: 'POST', body: JSON.stringify(data) }),
  getCheckins: (childId: number) => request<{ checkins: any[] }>(`/checkins?child_id=${childId}`),

  createTrip: (data: any) => request<{ trip: any }>('/trips', { method: 'POST', body: JSON.stringify(data) }),
  arriveTrip: (id: number) => request<{ trip: any }>(`/trips/${id}/arrive`, { method: 'POST' }),
  cancelTrip: (id: number) => request<{ trip: any }>(`/trips/${id}/cancel`, { method: 'POST' }),
  getTrips: (childId: number) => request<{ trips: any[] }>(`/trips?child_id=${childId}`),

  getConsentLog: (childId: number) => request<{ consent_log: any[] }>(`/consent?child_id=${childId}`),
  forgetSession: (session_id: string) => request<{ ok: boolean }>('/privacy/forget', { method: 'POST', body: JSON.stringify({ session_id }) }),
  forgetChild: (child_id: number) => request<{ ok: boolean }>('/privacy/forget-child', { method: 'POST', body: JSON.stringify({ child_id }) }),

  // Discreet SOS
  triggerDiscreetSOS: (data: { child_id: number; session_id: string; action: 'fake_shutdown' | 'discreet_confirm' }) =>
    request<{ ok: boolean; message: string }>('/discreet/discreet-sos', { method: 'POST', body: JSON.stringify(data) }),

  // Live SOS link
  createLiveSOSLink: (data: { alert_id: number; session_id: string }) =>
    request<{ token: string; expires_at: string }>('/discreet/live-link', { method: 'POST', body: JSON.stringify(data) }),
  getLiveSOSLink: (token: string) =>
    request<any>(`/discreet/live/${token}`),

  // Heartbeat pings
  sendPing: (data: { child_id: number; message?: string }) =>
    request<{ ping: any }>('/advanced/ping', { method: 'POST', body: JSON.stringify(data) }),
  getPings: (childId: number) => request<{ pings: any[] }>(`/advanced/pings/${childId}`),

  // Pickup confirmations
  createPickup: (data: any) => request<{ pickup: any }>('/advanced/pickup', { method: 'POST', body: JSON.stringify(data) }),
  confirmPickup: (data: { pickup_id: number; lat?: number; lng?: number }) =>
    request<{ pickup: any }>('/advanced/pickup/confirm', { method: 'POST', body: JSON.stringify(data) }),

  // Guardian roles
  addGuardian: (data: any) => request<{ guardian: any }>('/advanced/guardian', { method: 'POST', body: JSON.stringify(data) }),
  getGuardians: (childId: number) => request<{ guardians: any[] }>(`/advanced/guardians/${childId}`),
  deleteGuardian: (id: number) => request<{ ok: boolean }>(`/advanced/guardian/${id}`, { method: 'DELETE' }),

  // Group trips
  createGroupTrip: (data: any) => request<{ trip: any }>('/advanced/group-trip', { method: 'POST', body: JSON.stringify(data) }),
  getGroupTrips: () => request<{ trips: any[] }>('/advanced/group-trips'),

  // Daily digest
  getDailyDigest: (childId: number, date?: string) =>
    request<{ digest: any }>(`/advanced/digest/${childId}${date ? `?date=${date}` : ''}`),

  // Routines
  getRoutines: (childId: number) => request<{ routines: any[] }>(`/advanced/routines/${childId}`),

  // Monitoring - Websites
  getWebsiteUsage: (childId: number, days?: number) =>
    request<{ websites: any[] }>(`/monitoring/websites/${childId}?days=${days || 7}`),

  // Monitoring - Apps
  getAppUsage: (childId: number, days?: number) =>
    request<{ apps: any[] }>(`/monitoring/apps/${childId}?days=${days || 7}`),

  // Monitoring - Screen Time
  getScreenTime: (childId: number, days?: number) =>
    request<{ daily: any[] }>(`/monitoring/screentime/${childId}?days=${days || 7}`),
  getScreenTimeRules: (childId: number) =>
    request<{ rules: any[] }>(`/monitoring/screen-time-rules/${childId}`),
  createScreenTimeRule: (data: any) =>
    request<{ rule: any }>('/monitoring/screen-time-rules', { method: 'POST', body: JSON.stringify(data) }),
  deleteScreenTimeRule: (id: number) =>
    request<{ ok: boolean }>(`/monitoring/screen-time-rules/${id}`, { method: 'DELETE' }),

  // Monitoring - Content Flags
  getContentFlags: (childId: number, unresolved?: boolean) =>
    request<{ flags: any[] }>(`/monitoring/flags/${childId}${unresolved ? '?unresolved=true' : ''}`),
  resolveContentFlag: (id: number) =>
    request<{ flag: any }>(`/monitoring/flags/${id}/resolve`, { method: 'PUT' }),

  // Monitoring - Blocked Items
  getBlockedItems: (childId: number) =>
    request<{ blocked: any[] }>(`/monitoring/blocked/${childId}`),
  blockItem: (data: { child_id: number; item_type: 'app' | 'website'; item_value: string; reason?: string }) =>
    request<{ blocked: any }>('/monitoring/blocked', { method: 'POST', body: JSON.stringify(data) }),
  unblockItem: (id: number) =>
    request<{ ok: boolean }>(`/monitoring/blocked/${id}`, { method: 'DELETE' }),

  // Monitoring - Consent
  getMonitoringConsent: (childId: number) =>
    request<{ consents: any[] }>(`/monitoring/consent/${childId}`),
  setMonitoringConsent: (data: { child_id: number; consent_type: string; granted: boolean }) =>
    request<{ ok: boolean }>('/monitoring/consent', { method: 'POST', body: JSON.stringify(data) }),

  // Monitoring - Advanced Analytics
  getCategoryBreakdown: (childId: number, days?: number) =>
    request<{ categories: any[] }>(`/monitoring/categories/${childId}?days=${days || 7}`),
  getHourlyPattern: (childId: number, days?: number) =>
    request<{ hourly: any[]; peak_hour: number; peak_minutes: number }>(`/monitoring/hourly/${childId}?days=${days || 7}`),
  getCurrentUsage: (childId: number) =>
    request<{ current: any }>(`/monitoring/current/${childId}`),
  getUsageTrends: (childId: number, days?: number) =>
    request<{ trend: string; daily: any[]; avg_minutes: number; change_pct: number }>(`/monitoring/trends/${childId}?days=${days || 14}`),
  getTodayUsage: (childId: number) =>
    request<{ top_apps: any[]; top_websites: any[]; summary: any }>(`/monitoring/today/${childId}`),
};
