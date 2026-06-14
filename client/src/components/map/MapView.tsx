import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ChildProfile, Geofence, LiveLocation } from '../../types';
import { useSocket } from '../../context/SocketContext';

interface Props {
  selectedChild: ChildProfile | null;
  geofences: Geofence[];
  onMapClick?: (lat: number, lng: number) => void;
  drawingMode?: boolean;
}

export default function MapView({ selectedChild, geofences, onMapClick, drawingMode }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRef2 = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pulseRef = useRef<L.CircleMarker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const geofenceLayerRef = useRef<L.LayerGroup | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const animFrameRef = useRef<number>(0);
  const targetPosRef = useRef<[number, number] | null>(null);
  const currentPosRef = useRef<[number, number] | null>(null);
  const { socket } = useSocket();

  const { data: locationData } = useQuery({
    queryKey: ['location', selectedChild?.id],
    queryFn: () => api.getLatestLocation(selectedChild!.id),
    enabled: !!selectedChild,
    refetchInterval: 3000,
  });

  const { data: historyData } = useQuery({
    queryKey: ['locationHistory', selectedChild?.id],
    queryFn: () => api.getLocationHistory(selectedChild!.id, 80),
    enabled: !!selectedChild,
  });

  const smoothInterpolate = useCallback(() => {
    if (!targetPosRef.current || !currentPosRef.current) return;
    const [tLat, tLng] = targetPosRef.current;
    const [cLat, cLng] = currentPosRef.current;
    const factor = 0.15;
    const newLat = cLat + (tLat - cLat) * factor;
    const newLng = cLng + (tLng - cLng) * factor;
    currentPosRef.current = [newLat, newLng];

    if (markerRef.current) markerRef.current.setLatLng([newLat, newLng]);
    if (pulseRef.current) pulseRef.current.setLatLng([newLat, newLng]);
    if (accuracyCircleRef.current) accuracyCircleRef.current.setLatLng([newLat, newLng]);

    const dist = Math.abs(tLat - newLat) + Math.abs(tLng - newLng);
    if (dist > 0.00001) {
      animFrameRef.current = requestAnimationFrame(smoothInterpolate);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapRef2.current) return;
    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      maxZoom: 19,
      minZoom: 3,
    }).setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OSM &copy; CARTO',
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('click', (e) => {
      if (onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
    });

    mapRef2.current = map;
    return () => { map.remove(); mapRef2.current = null; };
  }, [onMapClick]);

  useEffect(() => {
    const loc = locationData?.location;
    if (!loc || !mapRef2.current) return;

    const pos: [number, number] = [loc.latitude, loc.longitude];
    const map = mapRef2.current;

    if (!markerRef.current) {
      const isIP = loc.location_source === 'ip';
      const color = isIP ? '#f59e0b' : '#3b82f6';
      const icon = L.divIcon({
        className: 'child-marker',
        html: `<div style="position:relative;width:28px;height:28px;">
          <div style="position:absolute;inset:0;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 2px 12px ${color}66;z-index:2"></div>
          <div style="position:absolute;inset:-6px;background:${color};border-radius:50%;opacity:.25;animation:pulse 2s infinite;z-index:1"></div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      markerRef.current = L.marker(pos, { icon }).addTo(map);

      const pulseIcon = L.divIcon({
        className: 'pulse-ring',
        html: `<div style="width:40px;height:40px;border:2px solid ${color}44;border-radius:50%;animation:pulse 2s infinite"></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      pulseRef.current = L.circleMarker(pos, { radius: 0 }) as any;

      if (loc.accuracy_m && loc.accuracy_m < 5000) {
        accuracyCircleRef.current = L.circle(pos, {
          radius: loc.accuracy_m,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          weight: 1,
          opacity: 0.3,
        }).addTo(map);
      }

      map.setView(pos, 16);
      currentPosRef.current = pos;
    }

    targetPosRef.current = pos;
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(smoothInterpolate);

    if (accuracyCircleRef.current && loc.accuracy_m && loc.accuracy_m < 5000) {
      accuracyCircleRef.current.setRadius(loc.accuracy_m);
    }
  }, [locationData, smoothInterpolate]);

  useEffect(() => {
    const history = historyData?.locations || [];
    if (history.length < 2 || !mapRef2.current) return;
    const points: L.LatLngExpression[] = history.map((l: any) => [l.latitude, l.longitude]);

    if (trailRef.current) {
      trailRef.current.setLatLngs(points);
    } else {
      trailRef.current = L.polyline(points, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.4,
        dashArray: '6 8',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapRef2.current);
    }
  }, [historyData]);

  useEffect(() => {
    if (!mapRef2.current) return;
    if (!geofenceLayerRef.current) {
      geofenceLayerRef.current = L.layerGroup().addTo(mapRef2.current);
    } else {
      geofenceLayerRef.current.clearLayers();
    }
    geofences.forEach(f => {
      L.circle([f.latitude, f.longitude], {
        radius: f.radius_m,
        color: f.is_safe ? '#22c55e' : '#ef4444',
        fillColor: f.is_safe ? '#22c55e' : '#ef4444',
        fillOpacity: 0.08,
        weight: 2,
        opacity: 0.5,
        dashArray: '4 6',
      }).bindPopup(`<b>${f.name}</b><br>${f.is_safe ? '✅ Safe Zone' : '⚠️ Unsafe Zone'}<br>${f.radius_m}m radius`)
        .addTo(geofenceLayerRef.current!);
    });
  }, [geofences]);

  useEffect(() => {
    if (!socket || !selectedChild) return;
    const handler = (data: any) => {
      if (data.child_id !== selectedChild.id) return;
      const loc = data.location;
      const pos: [number, number] = [loc.latitude, loc.longitude];
      targetPosRef.current = pos;
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(smoothInterpolate);
    };
    socket.on('location:update', handler);
    return () => { socket.off('location:update', handler); };
  }, [socket, selectedChild, smoothInterpolate]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
      {drawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
          📍 Click on the map to place geofence center
        </div>
      )}
      {!selectedChild && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm z-[500]">
          <div className="text-center">
            <div className="text-5xl mb-4">📍</div>
            <p className="text-white/60 text-lg">Select a child to view their location</p>
          </div>
        </div>
      )}
    </div>
  );
}
