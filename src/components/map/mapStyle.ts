/**
 * Clean Google map styles: quiet POIs and transit, crisp roads, soft land/water – the route, stops and
 * live traffic stand out. Used by the native Google provider (Android, iOS dev/store builds).
 */
type StyleRule = { featureType?: string; elementType?: string; stylers: Record<string, string | number>[] };

export const LIGHT_MAP_STYLE: StyleRule[] = [
  { elementType: 'geometry', stylers: [{ color: '#f4f6fa' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b6474' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcefe0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e3e8f0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e9eef7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d6deeb' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cde2f5' }] },
];

export const DARK_MAP_STYLE: StyleRule[] = [
  { elementType: 'geometry', stylers: [{ color: '#111a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1220' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14261f' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a3a55' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c2340' }] },
];
