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
  code: 'sauna', proximity: null, proximityMeters: null, access: null,
  options: [], openingHours: emptyHours,
};
const hotel = { code: 'wellness' };
const room = { code: 'view' };
const group = (category, amenities) => ({ category, amenities });
const cases = [
  ['unfilled sauna details', 'AmenityValue', sauna, true],
  ['expanded sauna details', 'AmenityValue', {
    ...sauna, label, options: [{ code: 'finnish', label: { en: 'Finnish sauna' } }],
  }, true],
  ['presence-only room amenity', 'AmenityValue', { code: 'balcony' }, true],
  ['expanded room amenity', 'AmenityValue', { code: 'balcony', label: { en: 'Balcony' } }, true],
  ['unfilled localized note', 'AmenityValue', { code: 'doctor', note: { en: null } }, true],
  ['invalid access code', 'AmenityValue', { ...sauna, access: 'free' }, false],
  ['invalid proximity code', 'AmenityValue', { ...sauna, proximity: 'inside' }, false],
  ['negative distance', 'AmenityValue', { ...sauna, proximityMeters: -1 }, false],
  ['missing amenity code', 'AmenityValue', { access: null }, false],
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
  ['room group', 'RoomTypeAmenityCategoryGroup', group(room, [{ code: 'balcony' }]), true],
  ['room category on hotel', 'HotelAmenityCategoryGroup', group(room, [{ code: 'balcony' }]), false],
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
