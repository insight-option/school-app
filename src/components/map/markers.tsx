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

/** Navigation-style bus: soft halo, solid disc, white arrow pointing along the heading. */
export function BusMarkerView({ heading, color }: { heading?: number | null; color?: string }) {
  const c = color ?? '#2563EB';
  const halo = /^#[0-9a-fA-F]{6}$/.test(c) ? `${c}33` : 'rgba(37,99,235,0.2)';
  // The "navigate" glyph points north-east; rotate by heading − 45° so 0° points north.
  return (
    <View style={[styles.wrap, { width: 76, height: 76 }]} collapsable={false}>
      <View style={[styles.busHalo, { backgroundColor: halo }]} />
      {/* White ring + solid disc as two plain circles: Android drops bordered / elevated views when it
          snapshots a custom marker into a bitmap. */}
      <View style={styles.busRing} collapsable={false}>
        <View style={[styles.busDisc, { backgroundColor: c }]} collapsable={false}>
          <View style={{ transform: [{ rotate: `${(heading ?? 0) - 45}deg` }] }}>
            <Ionicons name="navigate" size={21} color="#fff" />
          </View>
        </View>
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
  busHalo: { position: 'absolute', width: 70, height: 70, borderRadius: 35 },
  busRing: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  busDisc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  square: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
});
