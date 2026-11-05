/** Pure reverse-geocoding helpers (unit-tested in __tests__/pickup.test.ts). */
export type GeoComponent = { long_name: string; short_name: string; types: string[] };
export type GeoResult = {
  formatted_address: string;
  types: string[];
  address_components: GeoComponent[];
};

export const RESULT_TYPES = 'street_address|route|premise|neighborhood|sublocality|administrative_area_level_3|administrative_area_level_2|locality';
const isPlusCode = (s: string) => /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i.test(s.trim());

/** Pure: Google Geocoding results → the address parts people in Qatar use (area, street, zone, building). */
export function parseGeocode(results: GeoResult[]) {
  const first = (type: string, from = results) => {
    for (const r of from) {
      const c = r.address_components.find((x) => x.types.includes(type) && !isPlusCode(x.long_name));
      if (c) return c.long_name;
    }
    return null;
  };
  const streetResults = results.filter((r) => r.types.includes('street_address') || r.types.includes('premise') || r.types.includes('route'));
  const street = first('route', streetResults.length ? streetResults : results);
  const number = first(
    'street_number',
    results.filter((r) => r.types.includes('street_address') || r.types.includes('premise')),
  );
  const premise = first('premise');
  const area = first('administrative_area_level_3') ?? first('neighborhood') ?? first('sublocality');
  const zoneRaw = first('administrative_area_level_2');
  const zone = zoneRaw && /zone|منطقة|\d/i.test(zoneRaw) ? zoneRaw : null;
  const city = first('locality') ?? first('administrative_area_level_1')?.replace(/\s*Municipality$/i, '') ?? null;
  const country = first('country');
  const building = premise && !/^\d+$/.test(premise) ? premise : number;
  const line1 = [number && street ? `${number} ${street}` : street].filter(Boolean).join('');
  const formatted = [line1 || null, area, city].filter((x, i, a) => !!x && a.indexOf(x) === i).join(', ') || null;
  return {
    formatted,
    title: area ?? street ?? city,
    area,
    city,
    street,
    zone,
    building,
    country,
  };
}

