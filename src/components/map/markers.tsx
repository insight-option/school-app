import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../ui/Text';

/** Marker views shared by the native (react-native-maps) and web (Google Maps) map implementations. */

export function StudentMarkerView({ initials, color, order, selected }: { initials?: string; color?: string; order?: number | null; selected?: boolean }) {
  const size = selected ? 52 : 44;
  return (
    <View style={[styles.wrap, { width: size + 12, height: size + 12 }]}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? '#16A34A', borderWidth: selected ? 4 : 3 }]}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: selected ? 17 : 15, lineHeight: selected ? 20 : 18 }}>{initials ?? '?'}</Text>
      </View>
      {order !== null && order !== undefined && order < 900 ? (
        <View style={styles.orderBadge}>
          <Text style={styles.orderText}>{order}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function BusMarkerView({ heading, color }: { heading?: number | null; color?: string }) {
  return (
    <View style={[styles.wrap, { width: 60, height: 60 }]}>
      <View style={[styles.busOuter, { borderColor: color ?? '#2563EB' }]}>
        <View style={{ transform: [{ rotate: `${heading ?? 0}deg` }] }}>
          <Ionicons name="navigate" size={22} color={color ?? '#2563EB'} />
        </View>
      </View>
      <View style={[styles.busTag, { backgroundColor: color ?? '#2563EB' }]}>
        <Ionicons name="bus" size={12} color="#fff" />
      </View>
    </View>
  );
}

export function SchoolMarkerView({ color }: { color?: string }) {
  return (
    <View style={[styles.wrap, { width: 56, height: 56 }]}>
      <View style={[styles.square, { backgroundColor: color ?? '#7C3AED' }]}>
        <Ionicons name="school" size={22} color="#fff" />
      </View>
    </View>
  );
}

export function HomeMarkerView({ color }: { color?: string }) {
  return (
    <View style={[styles.wrap, { width: 52, height: 52 }]}>
      <View style={[styles.circle, { width: 40, height: 40, borderRadius: 20, backgroundColor: color ?? '#DB2777' }]}>
        <Ionicons name="home" size={20} color="#fff" />
      </View>
    </View>
  );
}

export function PinMarkerView({ color }: { color?: string }) {
  return (
    <View style={{ alignItems: 'center', width: 44, height: 56 }}>
      <Ionicons name="location" size={44} color={color ?? '#DC2626'} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center', borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  orderBadge: { position: 'absolute', top: 0, right: 0, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#fff' },
  orderText: { color: '#fff', fontSize: 11, fontWeight: '800', lineHeight: 13 },
  busOuter: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 3, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  busTag: { position: 'absolute', bottom: 2, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  square: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
});
