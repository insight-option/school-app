import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdvancedMarker, APIProvider, Map, useMap, type MapCameraChangedEvent, type MapMouseEvent } from '@vis.gl/react-google-maps';
import type { MapHandle, MapMarker, MapProps } from './types';
import { BusMarkerView, HomeMarkerView, PinMarkerView, SchoolMarkerView, StudentMarkerView } from './markers';
import { regionFor, type LatLng } from '../../lib/geo';
import { Text } from '../../ui/Text';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? '';
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

function zoomForDelta(delta: number) {
  return Math.max(3, Math.min(20, Math.round(Math.log2(360 / Math.max(delta, 0.0005)))));
}

/** Web map built on @vis.gl/react-google-maps. Same props as the native MapView. */
export const MapView = forwardRef<MapHandle, MapProps>(function MapView(props, ref) {
  if (!API_KEY) {
    return (
      <View style={[styles.fill, styles.center, props.style]}>
        <Text color="textMuted" align="center">
          Google Maps key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY in .env.
        </Text>
      </View>
    );
  }
  return (
    <APIProvider apiKey={API_KEY} libraries={['marker']}>
      <InnerMap {...props} handleRef={ref} />
    </APIProvider>
  );
});

function InnerMap({ handleRef, style, initialRegion, markers = [], polyline, polylineColor = '#2563EB', pin, onPinChange, onPress, onUserGesture, showsTraffic, onReady, testID }: MapProps & { handleRef: React.ForwardedRef<MapHandle> }) {
  const map = useMap();
  const readyRef = useRef(false);
  const polyRef = useRef<google.maps.Polyline | null>(null);
  const trafficRef = useRef<google.maps.TrafficLayer | null>(null);

  const region = useMemo(() => initialRegion ?? (markers.length ? regionFor(markers) : { lat: 24.7136, lng: 46.6753, latitudeDelta: 0.1, longitudeDelta: 0.1 }), [initialRegion, markers]);

  useImperativeHandle(
    handleRef,
    () => ({
      animateTo: (p, zoom) => {
        map?.panTo({ lat: p.lat, lng: p.lng });
        if (zoom) map?.setZoom(zoom);
      },
      fitTo: (points, pad = 60) => {
        if (!map || !points.length) return;
        const b = new google.maps.LatLngBounds();
        points.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(b, pad);
      },
    }),
    [map],
  );

  useEffect(() => {
    if (!map || readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  }, [map, onReady]);

  useEffect(() => {
    if (!map) return;
    polyRef.current?.setMap(null);
    if (polyline && polyline.length > 1) {
      polyRef.current = new google.maps.Polyline({ path: polyline.map((p) => ({ lat: p.lat, lng: p.lng })), strokeColor: polylineColor, strokeWeight: 5, strokeOpacity: 0.9, map });
    }
    return () => polyRef.current?.setMap(null);
  }, [map, polyline, polylineColor]);

  useEffect(() => {
    if (!map) return;
    if (showsTraffic) {
      trafficRef.current = trafficRef.current ?? new google.maps.TrafficLayer();
      trafficRef.current.setMap(map);
    } else trafficRef.current?.setMap(null);
  }, [map, showsTraffic]);

  return (
    <View style={[styles.fill, style]} testID={testID}>
      <Map
        mapId={MAP_ID}
        defaultCenter={{ lat: region.lat, lng: region.lng }}
        defaultZoom={zoomForDelta(region.latitudeDelta)}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        style={{ width: '100%', height: '100%' }}
        onClick={(e: MapMouseEvent) => {
          const ll = e.detail.latLng;
          if (ll) onPress?.({ lat: ll.lat, lng: ll.lng });
        }}
        onDragstart={onUserGesture}
        onCameraChanged={(_e: MapCameraChangedEvent) => undefined}
      >
        {markers.map((m) => (
          <WebMarker key={m.id} marker={m} />
        ))}
        {pin ? (
          <AdvancedMarker
            position={{ lat: pin.lat, lng: pin.lng }}
            draggable={!!onPinChange}
            zIndex={1000}
            onDragEnd={(e) => {
              const ll = e.latLng;
              if (ll) onPinChange?.({ lat: ll.lat(), lng: ll.lng() });
            }}
          >
            <PinMarkerView />
          </AdvancedMarker>
        ) : null}
      </Map>
    </View>
  );
}

const WebMarker = React.memo(function WebMarker({ marker: m }: { marker: MapMarker }) {
  const pos: LatLng = { lat: m.lat, lng: m.lng };
  return (
    <AdvancedMarker position={pos} onClick={m.onPress} title={m.title} zIndex={m.zIndex ?? (m.kind === 'bus' ? 500 : m.selected ? 400 : 100)} anchorPoint={['50%', '50%']}>
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
    </AdvancedMarker>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1 }, center: { alignItems: 'center', justifyContent: 'center', padding: 24 } });

export default MapView;
