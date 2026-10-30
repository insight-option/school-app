import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import RNMapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapPressEvent, type Region as RNRegion } from 'react-native-maps';
import type { MapHandle, MapMarker, MapProps } from './types';
import { BusMarkerView, HomeMarkerView, PinMarkerView, SchoolMarkerView, StudentMarkerView } from './markers';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from './mapStyle';
import { regionFor } from '../../lib/geo';
import { IS_EXPO_GO } from '../../lib/runtime';

// Expo Go on iOS has no Google Maps SDK – fall back to Apple Maps there; everywhere else use Google.
const PROVIDER = IS_EXPO_GO && Platform.OS === 'ios' ? undefined : PROVIDER_GOOGLE;

/** Apple Maps has no zoom levels – convert to a camera altitude in metres. */
const altitudeForZoom = (zoom: number) => Math.max(150, 40_000_000 / 2 ** zoom);

/** Native map (Google provider on Android & iOS). Same props as MapView.web.tsx. */
export const MapView = forwardRef<MapHandle, MapProps>(function MapView(
  {
    style,
    initialRegion,
    markers = [],
    polyline,
    polylineColor = '#2563EB',
    routeOutlineColor,
    polylineWidth = 6,
    routeSegments,
    mapType = 'standard',
    themed,
    dark,
    pin,
    onPinChange,
    onPress,
    onUserGesture,
    showsUserLocation,
    showsTraffic,
    onReady,
    padding,
    testID,
  },
  ref,
) {
  const mapRef = useRef<RNMapView>(null);

  const region: RNRegion | undefined = useMemo(() => {
    const r = initialRegion ?? (markers.length ? regionFor(markers) : undefined);
    return r ? { latitude: r.lat, longitude: r.lng, latitudeDelta: r.latitudeDelta, longitudeDelta: r.longitudeDelta } : undefined;
  }, [initialRegion, markers]);

  useImperativeHandle(
    ref,
    () => ({
      animateTo: (p, zoom) => {
        const delta = zoom ? 360 / 2 ** zoom : 0.01;
        mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: delta, longitudeDelta: delta }, 600);
      },
      fitTo: (points, pad = 60) => {
        if (!points.length) return;
        mapRef.current?.fitToCoordinates(
          points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
          { edgePadding: { top: pad + (padding?.top ?? 0), right: pad, bottom: pad + (padding?.bottom ?? 0), left: pad }, animated: true },
        );
      },
      follow: (p, opts) => {
        const zoom = opts?.zoom ?? 17;
        mapRef.current?.animateCamera(
          {
            center: { latitude: p.lat, longitude: p.lng },
            heading: opts?.heading ?? undefined,
            pitch: opts?.pitch ?? 0,
            zoom,
            altitude: altitudeForZoom(zoom),
          },
          { duration: 650 },
        );
      },
    }),
    [padding],
  );

  const handlePress = useCallback(
    (e: MapPressEvent) => {
      const c = e.nativeEvent.coordinate;
      onPress?.({ lat: c.latitude, lng: c.longitude });
    },
    [onPress],
  );

  const coords = useMemo(() => (polyline && polyline.length > 1 ? polyline.map((p) => ({ latitude: p.lat, longitude: p.lng })) : null), [polyline]);
  const customStyle = PROVIDER === PROVIDER_GOOGLE && themed && mapType === 'standard' ? (dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE) : undefined;

  return (
    <View style={[styles.fill, style]} testID={testID}>
      <RNMapView
        ref={mapRef}
        provider={PROVIDER}
        style={styles.fill}
        initialRegion={region}
        mapType={mapType}
        customMapStyle={customStyle}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        showsTraffic={showsTraffic}
        showsBuildings
        showsCompass={false}
        showsPointsOfInterests={!themed}
        toolbarEnabled={false}
        pitchEnabled
        rotateEnabled
        onPress={handlePress}
        onPanDrag={onUserGesture}
        onMapReady={onReady}
        mapPadding={padding ? { top: padding.top ?? 0, right: padding.right ?? 0, bottom: padding.bottom ?? 0, left: padding.left ?? 0 } : undefined}
      >
        {coords && routeOutlineColor ? <Polyline coordinates={coords} strokeColor={routeOutlineColor} strokeWidth={polylineWidth + 4} lineCap="round" lineJoin="round" zIndex={1} /> : null}
        {coords ? <Polyline coordinates={coords} strokeColor={polylineColor} strokeWidth={polylineWidth} lineCap="round" lineJoin="round" zIndex={2} /> : null}
        {routeSegments?.map((s, i) =>
          s.points.length > 1 ? (
            <Polyline
              key={`seg-${i}-${s.points.length}`}
              coordinates={s.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
              strokeColor={s.color}
              strokeWidth={polylineWidth}
              lineCap="round"
              lineJoin="round"
              zIndex={3}
            />
          ) : null,
        )}
        {markers.map((m) => (
          <NativeMarker key={m.id} marker={m} />
        ))}
        {pin ? (
          <Marker
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            draggable={!!onPinChange}
            onDragEnd={(e) => onPinChange?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={1000}
          >
            <PinMarkerView />
          </Marker>
        ) : null}
      </RNMapView>
    </View>
  );
});

const NativeMarker = React.memo(function NativeMarker({ marker: m }: { marker: MapMarker }) {
  // Re-render the marker image only when its visual state changes (tracksViewChanges is expensive).
  const visualKey = `${m.kind}-${m.color}-${m.initials}-${m.order}-${m.selected}-${Math.round((m.heading ?? 0) / 10)}`;
  return (
    <Marker
      key={visualKey}
      identifier={m.id}
      coordinate={{ latitude: m.lat, longitude: m.lng }}
      onPress={m.onPress}
      title={m.title}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={m.zIndex ?? (m.kind === 'bus' ? 500 : m.selected ? 400 : 100)}
      tracksViewChanges={false}
      flat={m.kind === 'bus'}
    >
      {m.kind === 'student' ? (
        <StudentMarkerView initials={m.initials} color={m.color} order={m.order} selected={m.selected} />
      ) : m.kind === 'bus' ? (
        <BusMarkerView heading={m.heading} color={m.color} />
      ) : m.kind === 'school' ? (
        <SchoolMarkerView color={m.color} />
      ) : m.kind === 'home' ? (
        <HomeMarkerView color={m.color} />
      ) : (
        <PinMarkerView color={m.color} />
      )}
    </Marker>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1 } });

export default MapView;
