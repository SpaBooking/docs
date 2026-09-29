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
const hotel = { scope: 'hotel', code: 'wellness' };
const room = { scope: 'roomType', code: 'view' };
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
  ['dictionary category with label', 'AmenityCategory', { ...hotel, label }, true],
  ['dictionary category without label', 'AmenityCategory', hotel, false],
  ['assigned category without label', 'AmenityCategoryRef', hotel, true],
  ['assigned category with label', 'AmenityCategoryRef', { ...room, label }, true],
  ['category without scope', 'AmenityCategoryRef', { code: 'wellness' }, false],
  ['hotel with a room category', 'AmenityCategoryRef', { scope: 'hotel', code: 'view' }, false],
  ['room with a hotel category', 'AmenityCategoryRef', { scope: 'roomType', code: 'wellness' }, false],
  ['legacy alias in a response', 'AmenityCategoryRef', { scope: 'roomType', code: 'room_view' }, false],
  ['hotel accessibility', 'AmenityCategoryRef', { scope: 'hotel', code: 'accessibility' }, true],
  ['room accessibility', 'AmenityCategoryRef', { scope: 'roomType', code: 'accessibility' }, true],
  ['hotel group', 'HotelAmenityCategoryGroup', group(hotel, [sauna]), true],
  ['room group', 'RoomTypeAmenityCategoryGroup', group(room, [{ code: 'balcony' }]), true],
  ['room scope on hotel', 'HotelAmenityCategoryGroup', group(room, [{ code: 'balcony' }]), false],
  ['hotel scope on room', 'RoomTypeAmenityCategoryGroup', group(hotel, [sauna]), false],
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
