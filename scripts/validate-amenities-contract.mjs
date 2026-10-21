import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { parse } from 'yaml';

const doc = parse(readFileSync(process.argv[2] ?? 'api/v2/openapi.yaml', 'utf8'));
// Keep the OpenAPI enum constraints intact. nullable alone does not add null
// to an enum: https://ajv.js.org/json-schema.html#nullable-openapi
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema({ components: { schemas: doc.components.schemas } }, 'v2');

const label = { 'cs-CZ': 'Sauna', en: 'Sauna' };
const emptyHours = { continuous: false, blocks: [] };
const sauna = {
  code: 'sauna', proximity: null, proximityMeters: null, pricing: null,
  options: [], openingHours: emptyHours,
};
const hotel = { code: 'wellness' };
const room = { code: 'view' };
const inclusions = { code: 'inclusions' };
const benefits = [
  { code: 'parking', pricing: 'included' },
  { code: 'welcome_drink' },
  { code: 'fruit_bowl' },
];
const group = (category, amenities) => ({ category, amenities });
const cases = [
  ['room amenity in all rooms', 'AmenityValue', { code: 'shower', coverage: 'all' }, true],
  ['room amenity in some rooms', 'AmenityValue', { code: 'balcony', coverage: 'some' }, true],
  ['null coverage', 'AmenityValue', { code: 'shower', coverage: null }, false],
  ['invalid coverage', 'AmenityValue', { code: 'shower', coverage: 'unknown' }, false],
  ['coverage dictionary kind', 'Amenity', { code: 'shower', label, detailKinds: ['coverage'] }, true],
  ['unfilled sauna details', 'AmenityValue', sauna, true],
  ['expanded sauna details', 'AmenityValue', {
    ...sauna, label, options: [{ code: 'finnish', label: { en: 'Finnish sauna' } }],
  }, true],
  ['presence-only room amenity', 'AmenityValue', { code: 'toilet' }, true],
  ['expanded room amenity', 'AmenityValue', { code: 'balcony', label: { en: 'Balcony' }, coverage: 'all' }, true],
  ['unfilled localized note', 'AmenityValue', { code: 'doctor', note: { en: null } }, true],
  ['invalid pricing code', 'AmenityValue', { ...sauna, pricing: 'free' }, false],
  ['invalid proximity code', 'AmenityValue', { ...sauna, proximity: 'inside' }, false],
  ['negative distance', 'AmenityValue', { ...sauna, proximityMeters: -1 }, false],
  ['missing amenity code', 'AmenityValue', { pricing: null }, false],
  ['legacy access kind', 'Amenity', { code: 'sauna', label, detailKinds: ['access'] }, false],
  ['missing selected option code', 'AmenityValue', { ...sauna, options: [{}] }, false],
  ['invalid opening time', 'AmenityValue', {
    ...sauna, openingHours: { continuous: false, blocks: [{ days: ['monday'], from: '25:00', to: '26:00' }] },
  }, false],
  ['dictionary category with label', 'AmenityCategory', { scope: 'hotel', ...hotel, label }, true],
  ['dictionary category without label', 'AmenityCategory', { scope: 'hotel', ...hotel }, false],
  ['dictionary category without scope', 'AmenityCategory', { ...hotel, label }, false],
  ['assigned category without label', 'HotelAmenityCategoryRef', hotel, true],
  ['assigned category with label', 'RoomTypeAmenityCategoryRef', { ...room, label }, true],
  ['assigned hotel category with scope', 'HotelAmenityCategoryRef', { scope: 'hotel', ...hotel }, false],
  ['expanded room category with scope', 'RoomTypeAmenityCategoryRef', { scope: 'roomType', ...room, label }, false],
  ['assigned category without code', 'HotelAmenityCategoryRef', { label }, false],
  ['hotel with a room category', 'HotelAmenityCategoryRef', room, false],
  ['room with a hotel category', 'RoomTypeAmenityCategoryRef', hotel, false],
  ['legacy alias in a response', 'RoomTypeAmenityCategoryRef', { code: 'room_view' }, false],
  ['hotel accessibility', 'HotelAmenityCategoryRef', { code: 'accessibility' }, true],
  ['room accessibility', 'RoomTypeAmenityCategoryRef', { code: 'accessibility' }, true],
  ['hotel group', 'HotelAmenityCategoryGroup', group(hotel, [sauna]), true],
  ['room group', 'RoomTypeAmenityCategoryGroup', group(room, [{ code: 'balcony', coverage: 'all' }]), true],
  ['room inclusions dictionary', 'AmenityCategory', {
    scope: 'roomType', ...inclusions, label: { en: 'Included with this room' },
  }, true],
  ['inclusions dictionary in hotel scope', 'AmenityCategory', {
    scope: 'hotel', ...inclusions, label: { en: 'Included with this room' },
  }, false],
  ['room inclusions group', 'RoomTypeAmenityCategoryGroup', group(inclusions, benefits), true],
  ['expanded room parking', 'RoomTypeAmenityCategoryGroup', group({
    ...inclusions, label: { de: 'Im Zimmerpreis inbegriffen' },
  }, [{ code: 'parking', pricing: 'included', label: { de: 'Parkplatz' } }]), true],
  ['room parking with unknown pricing', 'RoomTypeAmenityCategoryGroup',
    group(inclusions, [{ code: 'parking', pricing: null }]), true],
  ['room parking with invalid pricing', 'RoomTypeAmenityCategoryGroup',
    group(inclusions, [{ code: 'parking', pricing: 'free' }]), false],
  ['room inclusions on hotel', 'HotelAmenityCategoryGroup', group(inclusions, benefits), false],
  ['empty inclusions group', 'RoomTypeAmenityCategoryGroup', group(inclusions, []), false],
  ['room category on hotel', 'HotelAmenityCategoryGroup', group(room, [{ code: 'balcony', coverage: 'all' }]), false],
  ['hotel category on room', 'RoomTypeAmenityCategoryGroup', group(hotel, [sauna]), false],
  ['empty assigned hotel group', 'HotelAmenityCategoryGroup', group(hotel, []), false],
  ['empty assigned room group', 'RoomTypeAmenityCategoryGroup', group(room, []), false],
  ['hotel without amenities', 'Hotel/properties/amenityCategories', [], true],
  ['room without amenities', 'RoomType/properties/amenityCategories', [], true],
];

let failures = 0;
for (const [name, schema, value, expected] of cases) {
  const validate = ajv.compile({ $ref: `v2#/components/schemas/${schema}` });
  try {
    assert.equal(validate(value), expected, `${name}: ${ajv.errorsText(validate.errors)}`);
  } catch (error) {
    failures++;
    console.error(error.message);
  }
}
console.log(`Checked ${cases.length} amenity contract cases; ${failures} failures.`);
if (failures) process.exitCode = 1;
