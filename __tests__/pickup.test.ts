import { parseGeocode, type GeoResult } from '../amplify/functions/trips/geocode';

const comp = (long_name: string, type: string) => ({ long_name, short_name: long_name, types: [type, 'political'] });

/** Shapes taken from real Google Geocoding responses for Doha (result_type filtered). */
const westBay: GeoResult[] = [
  {
    types: ['premise', 'street_address'],
    formatted_address: 'Villa #08, 532 West Bay Lagoon Street, Doha, Qatar',
    address_components: [comp('Villa #08', 'premise'), comp('532', 'street_number'), comp('West Bay Lagoon Street', 'route'), comp('Doha', 'locality'), comp('Zone 66', 'administrative_area_level_2'), comp('Qatar', 'country')],
  },
  { types: ['route'], formatted_address: 'West Bay Lagoon Street, Doha, Qatar', address_components: [comp('West Bay Lagoon Street', 'route'), comp('Doha', 'locality')] },
  { types: ['administrative_area_level_3', 'political'], formatted_address: 'Legtaifiya, Doha, Qatar', address_components: [comp('Legtaifiya', 'administrative_area_level_3'), comp('Doha', 'locality')] },
];

const plusCodeFirst: GeoResult[] = [
  {
    types: ['premise', 'street_address'],
    formatted_address: '8C8P+GJX, Al-Rayyan, Qatar',
    address_components: [comp('8C8P+GJX', 'plus_code'), comp('Al-Rayyan', 'locality'), comp('Zone 52', 'administrative_area_level_2'), comp('Al Rayyan Municipality', 'administrative_area_level_1')],
  },
  { types: ['route'], formatted_address: 'Al Luqta St, Ar Rayyan, Qatar', address_components: [comp('Al Luqta Street', 'route'), comp('Ar Rayyan', 'locality')] },
  { types: ['administrative_area_level_3', 'political'], formatted_address: 'Al Shagub, Al-Rayyan, Qatar', address_components: [comp('Al Shagub', 'administrative_area_level_3'), comp('Al-Rayyan', 'locality')] },
  { types: ['neighborhood', 'political'], formatted_address: 'Qatar Foundation, Al-Rayyan, Qatar', address_components: [comp('Qatar Foundation', 'neighborhood')] },
];

describe('parseGeocode (Qatar addresses)', () => {
  it('extracts area, street, zone, building and city', () => {
    const g = parseGeocode(westBay);
    expect(g).toMatchObject({ area: 'Legtaifiya', street: 'West Bay Lagoon Street', zone: 'Zone 66', building: 'Villa #08', city: 'Doha', country: 'Qatar', title: 'Legtaifiya' });
    expect(g.formatted).toBe('532 West Bay Lagoon Street, Legtaifiya, Doha');
  });

  it('ignores plus codes and prefers the official area over the neighbourhood', () => {
    const g = parseGeocode(plusCodeFirst);
    expect(g.area).toBe('Al Shagub');
    expect(g.street).toBe('Al Luqta Street');
    expect(g.zone).toBe('Zone 52');
    expect(g.building).toBeNull();
    expect(g.title).toBe('Al Shagub');
    expect(JSON.stringify(g)).not.toContain('+');
  });

  it('falls back to the municipality when no locality exists', () => {
    const g = parseGeocode([{ types: ['administrative_area_level_2'], formatted_address: 'Zone 91, Qatar', address_components: [comp('Zone 91', 'administrative_area_level_2'), comp('Al Khor Municipality', 'administrative_area_level_1')] }]);
    expect(g.city).toBe('Al Khor');
    expect(g.zone).toBe('Zone 91');
    expect(g.title).toBe('Al Khor');
  });

  it('returns empty parts for no results', () => {
    expect(parseGeocode([])).toMatchObject({ area: null, street: null, city: null, formatted: null, title: null });
  });
});
