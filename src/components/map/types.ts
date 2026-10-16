import type { StyleProp, ViewStyle } from 'react-native';
import type { LatLng, Region } from '../../lib/geo';

export type MarkerKind = 'student' | 'bus' | 'school' | 'home' | 'pin';

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
};
