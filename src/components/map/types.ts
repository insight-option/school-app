import type { StyleProp, ViewStyle } from 'react-native';
import type { LatLng, Region } from '../../lib/geo';

export type MarkerKind = 'student' | 'bus' | 'school' | 'home' | 'pin';

export type MapType = 'standard' | 'satellite' | 'hybrid';

/** A coloured stretch drawn over the route (live traffic: slow / jam). */
export type RouteOverlay = { points: LatLng[]; color: string };

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
  /** Student initials / short label shown inside the marker. */
  initials?: string;
  /** Small number badge (stop order). */
  order?: number | null;
  /** Fill colour (student status, bus brand colour). */
  color?: string;
  /** Degrees, rotates the bus marker. */
  heading?: number | null;
  title?: string;
  selected?: boolean;
  onPress?: () => void;
  zIndex?: number;
};

export type MapProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  markers?: MapMarker[];
  polyline?: LatLng[];
  polylineColor?: string;
  /** Darker, wider line under the route so it reads on any background (premium "casing"). */
  routeOutlineColor?: string;
  polylineWidth?: number;
  /** Live-traffic stretches drawn on top of the route. */
  routeSegments?: RouteOverlay[];
  mapType?: MapType;
  /** Apply the app's clean map style (Google maps only; Apple Maps and satellite ignore it). */
  themed?: boolean;
  dark?: boolean;
  /** Draggable pin (home-location picker). */
  pin?: LatLng | null;
  onPinChange?: (p: LatLng) => void;
  onPress?: (p: LatLng) => void;
  /** Fires when the user starts dragging the map (used to pause follow mode). */
  onUserGesture?: () => void;
  showsUserLocation?: boolean;
  showsTraffic?: boolean;
  onReady?: () => void;
  /** Padding so controls/sheets don't cover map content. */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  testID?: string;
};

export type MapHandle = {
  animateTo: (p: LatLng, zoom?: number) => void;
  fitTo: (points: LatLng[], padding?: number) => void;
  /** Navigation camera: centre on the bus, rotate to its heading and tilt the map. */
  follow: (p: LatLng, opts?: { heading?: number | null; zoom?: number; pitch?: number }) => void;
};
