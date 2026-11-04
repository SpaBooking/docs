import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { toJsonSchema } from './lib/openapi-schema.mjs';

const doc = parse(readFileSync('api/v2/openapi.yaml', 'utf8'));
const schemas = doc.components.schemas;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema({ definitions: toJsonSchema(schemas, 'v2') }, 'v2');
let checked = 0;
const clone = value => structuredClone(value);
// Mintlify renders property-pointer refs as `any`, even when OpenAPI validators
// resolve them correctly. Field refs must name reusable schema components.
function assertRenderableRefs(value, path) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    assert.match(value.$ref, /^#\/components\/schemas\/[^/]+$/, `${path}: use a schema component reference for Mintlify`);
    checked++;
  }
  for (const [key, child] of Object.entries(value)) assertRenderableRefs(child, `${path}.${key}`);
}
assertRenderableRefs(schemas, 'components.schemas');
function expectSchema(name, value, valid, label) {
  checked++;
  const validate = ajv.compile({ $ref: `v2#/definitions/${name}` });
  assert.equal(validate(value), valid, `${label}: ${ajv.errorsText(validate.errors)}`);
}
expectSchema('HotelMealService', { enabled: false, servingTime: { from: null, to: null }, serviceMethod: null, drinksIncluded: false, drinksNote: { en: null } }, true, 'unset hotel service method remains null');
const base = doc.paths['/visit-types/{visitTypeId}'].get.responses['200'].content['application/json'].examples['without-expansions'].value;
const changed = update => { const value = clone(base); update(value); return value; };
expectSchema('VisitType', base, true, 'canonical package');
for (const category of ['health', 'wellness', null, 'spa']) {
  for (const payer of ['guest', 'guest_and_insurer', 'insurer', null, 'self']) {
    const value = changed(v => { v.category = category; v.payer = payer; v.bookingMode = 'request'; });
    const valid = category === 'health'
      ? ['guest', 'guest_and_insurer', 'insurer'].includes(payer)
      : category === 'wellness' && payer === null;
    expectSchema('VisitType', value, valid, `category=${category}, payer=${payer}`);
  }
}
expectSchema('VisitType', changed(v => { v.payer = 'insurer'; }), false, 'insurer cannot book instantly');
for (const field of ['category', 'payer', 'channelContent', 'board', 'stayLength', 'arrival']) {
  expectSchema('VisitType', changed(v => { delete v[field]; }), false, `required ${field}`);
}
expectSchema('VisitType', changed(v => { v.stayLength = null; }), false, 'length never null');
expectSchema('VisitType', changed(v => { v.board.meals = null; }), false, 'meals never null');
expectSchema('VisitType', changed(v => { v.channelContent = { collections: null }; }), false, 'collections never null');
expectSchema('VisitType', changed(v => { v.channelContent.collections = ['wellness', 'wellness']; }), false, 'collections are unique');
expectSchema('VisitType', changed(v => { v.channelContent.collections = []; }), true, 'collections can be empty');
expectSchema('VisitType', changed(v => { v.collections = v.channelContent.collections; }), true, 'extra keys are not forbidden by the schema');
expectSchema('VisitType', changed(v => { v.shortDescription.de = 'x'.repeat(121); }), false, 'short text limit');
expectSchema('VisitType', changed(v => { v.available = false; }), false, 'unavailable needs reason');
expectSchema('VisitType', changed(v => { v.unavailableReason = 'disabled'; }), false, 'available needs null reason');
expectSchema('VisitType', changed(v => { v.available = false; v.unavailableReason = 'withdrawn'; }), false, 'old reason removed');
expectSchema('VisitType', changed(v => { v.available = false; v.unavailableReason = 'no_hotels'; v.hotelListings = []; v.priceFrom = null; }), true, 'unavailable package');
expectSchema('VisitType', changed(v => { v.stayLength.max = null; }), true, 'unlimited length');
expectSchema('VisitType', changed(v => { v.validity = null; }), true, 'no validity periods');
expectSchema('VisitType', changed(v => { v.validity = []; }), true, 'ended validity periods');
expectSchema('VisitType', changed(v => { v.priceFrom = null; }), true, 'package without a price');
expectSchema('VisitType', changed(v => { v.priceFrom = {}; }), false, 'empty map is not a price');
expectSchema('VisitType', changed(v => { v.priceFrom = { USD: v.priceFrom.CZK }; }), false, 'unknown currency');

const arrivals = [
  [{ type: 'weekdays', weekdays: ['monday'] }, true],
  [{ type: 'dates', dates: ['2026-12-22'] }, true],
  [{ type: 'dates', dates: [] }, true],
  [{ type: 'weekdays', weekdays: [] }, false],
  [{ type: 'weekdays', weekdays: ['sunday', 'sunday'] }, false],
  [{ type: 'weekdays', weekdays: ['sunday'], dates: [] }, false],
  [{ type: 'dates', dates: ['2026-12-22'], weekdays: [] }, false],
  [{ weekdays: ['sunday'] }, false],
  [{ type: 'dates', dates: ['2026-02-30'] }, false],
  [{ type: 'any' }, false],
];
for (const [value, valid] of arrivals) expectSchema('VisitTypeArrival', value, valid, JSON.stringify(value));
const procedure = clone(base.treatment.procedures.items[0]);
delete procedure.count;
expectSchema('Procedure', procedure, true, 'hotel procedure');
expectSchema('Procedure', { ...procedure, count: 2 }, false, 'hotel procedure has no count');
expectSchema('TreatmentProcedure', { ...procedure, count: 2 }, true, 'treatment procedure count');
for (const [selection, count, hasItems, valid] of [
  ['fixed', 2, true, true],
  ['fixed', null, true, false],
  ['from_list', null, true, true],
  ['from_list', 2, true, false],
  ['hotel_offer', null, false, true],
  ['hotel_offer', null, true, false],
]) {
  expectSchema('VisitType', changed(v => {
    v.treatment.procedures.selection = selection;
    v.treatment.procedures.items = hasItems ? [{ ...procedure, count }] : [];
  }), valid, `procedure mode ${selection}, count ${count}, list ${hasItems}`);
}
for (const exam of ['interim', 'final']) for (const [included, threshold, valid] of [
  [false, null, true], [false, 14, false], [true, null, true], [true, 14, true],
]) {
  expectSchema('VisitType', changed(v => {
    v.treatment.exams[exam] = included;
    v.treatment.exams[`${exam}FromNights`] = threshold;
  }), valid, `${exam} included ${included}, threshold ${threshold}`);
}
const minimum = base.priceFrom.CZK.perStay;
expectSchema('PriceFromMinimum', minimum, true, 'price minimum');
for (const field of ['hotel', 'visitType', 'original']) {
  const value = clone(minimum); delete value[field];
  expectSchema('PriceFromMinimum', value, false, `minimum requires ${field}`);
}
expectSchema('PriceFromMinimum', { ...minimum, original: null }, true, 'minimum without a promotion');
expectSchema('HotelListing', { hotelId: base.hotelListings[0].hotelId, priceFrom: null }, true, 'hotel without an offer');
const hotel = clone(schemas.Hotel.example);
expectSchema('Hotel', hotel, true, 'hotel example');
{
  const value = clone(hotel); delete value.procedures;
  expectSchema('Hotel', value, false, 'hotel requires procedures');
}
{
  const value = clone(hotel); delete value.priceFrom.CZK.all.perStay.hotel;
  expectSchema('Hotel', value, false, 'hotel minimum names the hotel');
}
{
  const value = clone(hotel); value.priceFrom = { CZK: { health: value.priceFrom.CZK.health } };
  expectSchema('Hotel', value, false, 'hotel price requires the all group');
}
expectSchema('Hotel', { ...hotel, priceFrom: null }, true, 'hotel without a price');

// Semantic response invariants that OpenAPI 3.0 cannot express.
const mealOrder = ['breakfast', 'lunch', 'dinner', 'all_inclusive'];
const collectionOrder = schemas.VisitTypeCollection.enum;
const exampleDay = '2026-11-03';
const periodMetrics = ['perPersonPerNight', 'perPersonPerStay', 'perStay'];
const currencyKeys = prices => Object.keys(prices ?? {}).sort();
const unionCurrencies = rows => [...new Set(rows.flatMap(row => currencyKeys(row.priceFrom)))].sort();
const dayIndex = day => Date.parse(day + 'T00:00:00Z') / 86400000;
const minimumNights = value => value.stayLength.min * (value.stayLength.unit === 'week' ? 7 : 1);
const compare = (a, b) => typeof a === 'number' ? a - b : a.localeCompare(b);
const winner = (pairs, metric) => [...pairs].sort((a, b) => {
  const key = pair => metric === 'perStay'
    ? [pair.perStay.amount.amountMinor, pair.perStay.occupancy, pair.perStay.hotel.id, pair.perStay.roomTypeId]
    : [pair.perPersonPerStay.amount.amountMinor, pair.perPersonPerNight.amount.amountMinor, pair.perPersonPerStay.occupancy, pair.perPersonPerStay.hotel.id, pair.perPersonPerStay.roomTypeId];
  const ak = key(a), bk = key(b);
  for (let i = 0; i < ak.length; i++) { const difference = compare(ak[i], bk[i]); if (difference) return difference; }
  return 0;
})[0][metric];
function assertPricePeriods(value, hotelFiltered) {
  const root = value.priceFromPeriods;
  if (root === null) {
    for (const listing of value.hotelListings) assert.equal(listing.priceFromPeriods, null, 'invalid source is null on every level');
    return;
  }
  assert(Array.isArray(root), 'expanded root has periods');
  const publicIds = value.promotions.map(p => p.id);
  const promotionById = new Map(value.promotions.map(p => [p.id, p]));
  const appliesTo = (promotion, hotel, room) => promotion.appliesTo === null || promotion.appliesTo.some(scope =>
    scope.hotelId === hotel && (!room || scope.roomTypeIds === null || scope.roomTypeIds.includes(room)));
  const orderedIds = (ids, permitted, label) => {
    assert.deepEqual(ids, publicIds.filter(id => ids.includes(id)), `${label}: unique public order`);
    assert(ids.every(id => permitted.includes(id)), `${label}: references exist`);
  };
  const checkPeriods = (periods, hotelId) => {
    assert(Array.isArray(periods), 'valid source has arrays on every level');
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      assert(period.from <= period.to, 'period has at least one night');
      if (i) assert(periods[i - 1].to < period.from, 'periods are sorted and disjoint');
      orderedIds(period.activePromotionIds, publicIds, 'active promotions');
      for (const id of period.activePromotionIds) {
        const promotion = promotionById.get(id);
        assert(promotion.from <= period.from && (promotion.to === null || promotion.to >= period.to), 'active promotion covers the whole period');
        if (hotelId) assert(appliesTo(promotion, hotelId), 'active promotion applies to listing hotel');
      }
      for (const [currency, prices] of Object.entries(period.priceFrom ?? {})) {
        assert(['CZK', 'EUR'].includes(currency), 'supported period currency');
        for (const key of periodMetrics) {
          const minimum = prices[key];
          if (hotelId) assert.equal(minimum.hotel.id, hotelId, 'listing period hotel');
          assert.equal(minimum.nights, minimumNights(value), 'period uses package minimum length in nights');
          assert.equal(minimum.amount.currency, currency, 'period currency matches key');
          assert(Number.isSafeInteger(minimum.amount.amountMinor) && minimum.amount.amountMinor >= 0, 'safe nonnegative period money');
          assert.equal(minimum.amount.currencyExponent, 2, 'period money exponent');
          if (minimum.original) {
            assert.equal(minimum.original.currency, currency, 'period original currency');
            assert(minimum.original.amountMinor > minimum.amount.amountMinor, 'period original exceeds amount');
          }
          orderedIds(minimum.appliedPromotionIds, period.activePromotionIds, 'applied promotions');
          for (const id of minimum.appliedPromotionIds) assert(appliesTo(promotionById.get(id), minimum.hotel.id, minimum.roomTypeId), 'applied promotion matches the winning room');
          if (!minimum.appliedPromotionIds.length) assert.equal(minimum.original, null, 'no applied discount means no original');
        }
        for (const key of ['hotel', 'roomTypeId', 'occupancy', 'nights', 'appliedPromotionIds']) {
          assert.deepEqual(prices.perPersonPerNight[key], prices.perPersonPerStay[key], `personal pair shares ${key}`);
        }
      }
    }
  };
  checkPeriods(root);
  for (const listing of value.hotelListings) checkPeriods(listing.priceFromPeriods, listing.hotelId);
  if (hotelFiltered) return;
  let previousGroups;
  for (const [index, period] of root.entries()) {
    const hotelPeriods = value.hotelListings.map(listing => listing.priceFromPeriods.find(p => p.from <= period.from && p.to >= period.to));
    assert(hotelPeriods.every(Boolean), 'root refines every listing');
    if (hotelPeriods.length && index && dayIndex(root[index - 1].to) + 1 === dayIndex(period.from)) {
      assert(hotelPeriods.some((p, i) => p !== previousGroups[i]), 'root does not split unchanged listing periods');
    }
    previousGroups = hotelPeriods;
    const activeIds = new Set(hotelPeriods.flatMap(p => p.activePromotionIds));
    assert.deepEqual(period.activePromotionIds, publicIds.filter(id => activeIds.has(id)), 'root active promotions are the union');
    assert.deepEqual(currencyKeys(period.priceFrom), unionCurrencies(hotelPeriods), 'root has exactly period currencies');
    for (const [currency, prices] of Object.entries(period.priceFrom ?? {})) for (const key of periodMetrics) {
      const candidates = hotelPeriods.flatMap(p => p.priceFrom?.[currency] ? [p.priceFrom[currency]] : []);
      assert.deepEqual(prices[key], winner(candidates, key), 'root copies the whole winning metric using the defined tie-breaks');
    }
  }
  for (const listing of value.hotelListings) for (const period of listing.priceFromPeriods) {
    const covered = root.filter(p => p.from >= period.from && p.to <= period.to);
    assert.equal(covered.reduce((sum, p) => sum + dayIndex(p.to) - dayIndex(p.from) + 1, 0), dayIndex(period.to) - dayIndex(period.from) + 1, 'root and listings cover the same nights');
  }
}
export function assertVisitTypeExample(value, { hotelFiltered = false, collectionsEnabled = true } = {}) {
  function checkNames(node) {
    if (!node || typeof node !== 'object') return;
    if (node.name && typeof node.name === 'object') assert.deepEqual(Object.keys(node.name), ['cs-CZ', 'de'], 'example names match Accept-Language');
    for (const child of Object.values(node)) checkNames(child);
  }
  checkNames(value);
  assert.deepEqual(value.board.meals.map(row => row.meal), mealOrder, 'server emits each meal once in canonical order');
  if (value.board.meals[3].included) assert(value.board.meals.slice(0, 3).every(row => row.included), 'all inclusive includes each meal');
  assert(value.stayLength.max === null || value.stayLength.max >= value.stayLength.min, 'max >= min');
  if (value.validity) for (const p of value.validity) assert(p.from <= p.to, 'valid period order');
  if (value.arrival.type === 'dates') assert.deepEqual(value.arrival.dates, [...new Set(value.arrival.dates)].sort(), 'arrival date order');
  const collections = value.channelContent.collections;
  assert.deepEqual(collections, collectionOrder.filter(code => collections.includes(code)), 'collections follow the code list order');
  const currentPromotions = value.promotions.filter(p => p.to === null || p.to >= exampleDay);
  assert.equal(collections.includes('special_offers'), collectionsEnabled && currentPromotions.length > 0, 'special_offers uses only current and future promotions');
  if (!('priceFromPeriods' in value)) assert.equal(currentPromotions.length, value.promotions.length, 'ended promotions require priceFromPeriods');
  if (['ended', 'no_hotels'].includes(value.unavailableReason)) assert.equal(value.priceFrom, null, 'ended or unassigned package has no current stay price');
  if (value.unavailableReason === 'no_hotels') assert.deepEqual(value.hotelListings, [], 'no_hotels has no listings');
  const ids = new Set(value.hotelListings.map(h => h.hotelId));
  assert.equal(ids.size, value.hotelListings.length, 'distinct hotel entries');
  const checkMinimum = (minimum, currency, hotelId) => {
    assert.equal(minimum.nights, minimumNights(value), 'priceFrom uses the package minimum in nights');
    if (hotelId) assert.equal(minimum.hotel.id, hotelId, 'minimum hotel identity');
    assert.equal(minimum.visitType.id, value.id, 'minimum visit type identity');
    assert.equal(minimum.amount.currency, currency, 'price currency key');
    if (minimum.original) {
      assert.equal(minimum.original.currency, currency, 'original currency');
      assert(minimum.original.amountMinor > minimum.amount.amountMinor, 'original exceeds amount');
    }
  };
  if (!hotelFiltered) assert.deepEqual(currencyKeys(value.priceFrom), unionCurrencies(value.hotelListings), 'aggregate has exactly hotel currencies');
  for (const [currency, pair] of Object.entries(value.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) checkMinimum(pair[metric], currency);
  for (const h of value.hotelListings) {
    if (h.hotel) assert.equal(h.hotel.id, h.hotelId, 'expanded hotel identity');
    for (const [currency, pair] of Object.entries(h.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) checkMinimum(pair[metric], currency, h.hotelId);
  }
  if (!hotelFiltered) for (const [currency, pair] of Object.entries(value.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) {
    const amounts = value.hotelListings.flatMap(h => h.priceFrom?.[currency] ? [h.priceFrom[currency][metric].amount.amountMinor] : []);
    assert(amounts.length > 0, 'aggregate offer has a hotel');
    assert.equal(pair[metric].amount.amountMinor, Math.min(...amounts), 'aggregate is hotel minimum');
    assert(ids.has(pair[metric].hotel.id), 'aggregate hotel belongs to package');
    assert.equal(pair[metric].visitType.id, value.id, 'aggregate visit type identity');
  }
  assert.equal(new Set(value.promotions.map(p => p.id)).size, value.promotions.length, 'distinct promotion identity');
  for (const p of value.promotions) assert(p.to === null || p.from <= p.to, 'promotion date order');
  if ('priceFromPeriods' in value) assertPricePeriods(value, hotelFiltered);
  else for (const listing of value.hotelListings) assert(!('priceFromPeriods' in listing), 'period expansion has the same presence on every level');
  assert(!('hotels' in value), 'public hotels replaced by hotelListings');
  for (const listing of value.hotelListings) assert(!('seasons' in listing), 'public seasons removed');
  for (const promotion of value.promotions) assert(!('hotels' in promotion), 'promotion scopes use appliesTo');
  for (const key of ['deposit', 'loyaltyPrograms', 'departure', 'hotelIds', 'meals', 'stayCategory', 'paymentType', 'collections']) assert(!(key in value), `removed field ${key}`);
}
function expectSemantics(value, valid, label) {
  checked++;
  if (valid) assert.doesNotThrow(() => assertVisitTypeExample(value), label);
  else assert.throws(() => assertVisitTypeExample(value), undefined, label);
}
expectSemantics(base, true, 'default semantics');
// The Visit type object page documents every field, so its example carries the
// optional fields of both expansions and follows the same response rules.
{
  const value = schemas.VisitType.example;
  expectSchema('VisitType', value, true, 'object page example');
  assertVisitTypeExample(value);
  checked++;
  assert('priceFromPeriods' in value, 'object page example shows priceFromPeriods');
  for (const listing of value.hotelListings) assert('hotel' in listing && 'priceFromPeriods' in listing, 'object page example shows both listing expansions');
}
// One identity per hotel across all examples.
{
  const namesById = new Map(), idsByName = new Map();
  (function collect(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === 'hotel' && child && typeof child.id === 'string' && child.name && typeof child.name === 'object') {
        const name = child.name['cs-CZ'];
        if (!namesById.has(child.id)) namesById.set(child.id, new Set());
        if (!idsByName.has(name)) idsByName.set(name, new Set());
        namesById.get(child.id).add(name);
        idsByName.get(name).add(child.id);
      }
      collect(child);
    }
  })(doc);
  for (const [id, names] of namesById) assert.equal(names.size, 1, `hotel ${id} has one name`);
  for (const [name, ids] of idsByName) assert.equal(ids.size, 1, `${name} has one hotel id`);
  checked++;
}
expectSemantics(changed(v => { v.board.meals[3].included = true; }), false, 'inconsistent all inclusive');
expectSemantics(changed(v => { v.board.meals[1].meal = 'breakfast'; }), false, 'duplicate meal code');
expectSemantics(changed(v => { v.stayLength.max = 0; }), false, 'invalid min/max relation');
expectSemantics(changed(v => { v.hotelListings[1].priceFrom.CZK.perStay.amount.amountMinor += 1; }), false, 'aggregate mismatch');
expectSemantics(changed(v => { v.priceFrom = null; }), false, 'aggregate cannot omit a priced hotel');
expectSemantics(changed(v => { v.promotions.push(clone(v.promotions[0])); }), false, 'duplicate promotion');
expectSemantics(changed(v => { v.promotions = []; }), false, 'special_offers without a promotion');
expectSemantics(changed(v => { v.channelContent.collections.reverse(); }), false, 'collections out of order');
for (const field of ['deposit', 'loyaltyPrograms', 'departure', 'hotelIds', 'meals', 'stayCategory', 'paymentType', 'collections']) {
  assert(!(field in schemas.VisitType.properties), `removed schema property ${field}`);
}
assert(!('channel' in schemas.Promotion.properties), 'no public promotion channel');
assert('procedures' in schemas.Hotel.properties && schemas.Hotel.required.includes('procedures'), 'hotel lists its procedures');
assert('hotel' in schemas.PriceFromMinimum.properties, 'one minimum shape names the hotel');
for (const name of ['DraftHotel', 'DraftHotelPriceFrom', 'SharedPriceFromMinimum', 'VisitTypePriceFrom']) assert(!(name in schemas), `no parallel ${name} schema`);
assert(!('minNights' in schemas.VisitTypeStayLength.properties));
assert(!('maxNights' in schemas.VisitTypeStayLength.properties));
assert.deepEqual(schemas.VisitTypeWeekdayArrival.additionalProperties, false);
assert.deepEqual(schemas.VisitTypeDateArrival.additionalProperties, false);
// Property order is documentation order: every object in an example, nested ones
// included, lists its keys in the order of its schema's properties.
const deref = schema => schema?.$ref
  ? schema.$ref.replace('#/components/schemas/', '').split('/').reduce((node, key) => node[key], schemas)
  : schema;
function propertiesOf(schema, value) {
  schema = deref(schema);
  if (!schema) return null;
  const properties = {};
  for (const part of schema.allOf ?? []) Object.assign(properties, propertiesOf(part, value) ?? {});
  Object.assign(properties, schema.properties ?? {});
  if (!Object.keys(properties).length) for (const variants of [schema.oneOf, schema.anyOf]) {
    const match = (variants ?? []).map(variant => propertiesOf(variant, value))
      .find(candidate => candidate && Object.keys(value).every(key => key in candidate));
    if (match) Object.assign(properties, match);
  }
  return Object.keys(properties).length ? properties : null;
}
function keysInSchemaOrder(schema, value, path) {
  if (Array.isArray(value)) {
    const items = deref(schema)?.items ?? deref(deref(schema)?.allOf?.[0])?.items;
    if (items) value.forEach((item, index) => keysInSchemaOrder(items, item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const properties = propertiesOf(schema, value);
  if (!properties) return;
  const keys = Object.keys(value).filter(key => key in properties);
  assert.deepEqual(keys, Object.keys(properties).filter(key => keys.includes(key)), `${path}: keys follow the schema order`);
  checked++;
  for (const key of keys) keysInSchemaOrder(properties[key], value[key], `${path}.${key}`);
}
for (const [name, schema] of Object.entries(schemas)) if ('example' in schema) keysInSchemaOrder(schema, schema.example, name);
keysInSchemaOrder(schemas.Hotel.properties.amenityCategories, schemas.Hotel.properties.amenityCategories.example, 'Hotel.amenityCategories');
for (const path of ['/visit-types', '/visit-types/{visitTypeId}', '/hotels']) {
  const content = doc.paths[path].get.responses['200'].content['application/json'];
  for (const [name, example] of Object.entries(content.examples)) keysInSchemaOrder(content.schema, example.value, `${path} ${name}`);
}
for (const path of ['/visit-types', '/visit-types/{visitTypeId}']) {
  const operation = doc.paths[path].get;
  const parameters = operation.parameters.filter(p => p.name);
  const detail = path.includes('{');
  assert.deepEqual(parameters.find(p => p.name === 'expand').schema.items.enum, detail ? ['hotel', 'priceFromPeriods'] : ['hotel']);
  if (!detail) {
    for (const field of ['category', 'payer', 'board', 'collection']) assert(parameters.some(p => p.name === field));
    for (const field of ['stayCategory', 'paymentType', 'meal']) assert(!parameters.some(p => p.name === field));
  }
  const examples = operation.responses['200'].content['application/json'].examples;
  const names = Object.keys(examples);
  assert(names.length >= 2 && names.some(name => name.includes('expand-hotel')) && names.some(name => !name.includes('expand')), 'both expand variants');
  for (const [name, example] of Object.entries(examples)) {
    const values = detail ? [example.value] : example.value.data;
    for (const value of values) {
      expectSchema('VisitType', value, true, `${name}: complete response schema`);
      assertVisitTypeExample(value, { hotelFiltered: name === 'one-hotel-with-price-periods' }); checked++;
    }
    for (const value of values) {
      assert.equal('priceFromPeriods' in value, detail && name.includes('price-periods'), `${name}: root periods only with expansion`);
      assertDocumentedPrices(name, value);
      const expanded = name.includes('expand-hotel');
      for (const entry of value.hotelListings) {
        assert.equal('hotel' in entry, expanded, `${name}: hotel summary only with expand=hotel`);
        assert.equal('priceFromPeriods' in entry, name.includes('price-periods'), `${name}: periods only with expand=priceFromPeriods`);
      }
    }
  }
}
function assertDocumentedPrices(name, value) {
  if (value.id === '6720c0a1b2c3d4e5f6a7b802' || name === 'disabled-with-price') {
    assert(value.priceFrom, `${name}: request and disabled examples keep their calculated prices`);
    assert.equal(value.priceFrom.EUR.perPersonPerNight.amount.amountMinor, 10000, `${name}: documented nightly price`);
    const nights = minimumNights(value);
    assert.equal(value.priceFrom.EUR.perStay.nights, nights, `${name}: weeks convert to nights`);
    assert.equal(value.priceFrom.EUR.perStay.amount.amountMinor, 10000 * nights, `${name}: documented room price`);
    const pramen = value.hotelListings.find(h => h.hotelId === '6720c0a1b2c3d4e5f6a7c101');
    assert.deepEqual(pramen.priceFrom, value.priceFrom, `${name}: documented listing price`);
  }
  if (name === 'ended-with-price-periods') {
    assert.equal(value.unavailableReason, 'ended');
    assert.deepEqual(value.validity, []);
    assert.equal(value.priceFrom, null);
    assert.deepEqual(value.priceFromPeriods.map(p => [p.from, p.to]), [
      ['2026-10-01', '2026-10-15'], ['2026-10-16', '2026-10-31'],
    ], 'ended example retains both configured periods');
    assert.deepEqual(value.priceFromPeriods.map(p => periodMetrics.map(k => p.priceFrom.EUR[k].amount.amountMinor)), [[9000, 63000, 126000], [10000, 70000, 140000]]);
    assert.deepEqual(value.priceFromPeriods.map(p => periodMetrics.map(k => p.priceFrom.EUR[k].original?.amountMinor ?? null)), [[10000, 70000, 140000], [null, null, null]]);
    assert.deepEqual(value.priceFromPeriods.map(p => p.activePromotionIds), [['6720c0a1b2c3d4e5f6a7d315'], []]);
    assert(!value.channelContent.collections.includes('special_offers'), 'past promotion does not create a current offer');
    assert.deepEqual(value.hotelListings[0].priceFromPeriods, value.priceFromPeriods);
  }
  if (name === 'expand-hotel-price-periods' || name === 'one-hotel-with-price-periods') {
    assert.equal(value.priceFrom, null, 'capacity is absent in the period example');
    assert.deepEqual(value.priceFromPeriods.map(p => [p.from, p.to]), [
      ['2026-11-01', '2027-01-04'], ['2027-01-05', '2027-01-09'], ['2027-01-10', '2027-01-11'],
      ['2027-01-12', '2027-01-12'], ['2027-01-13', '2027-01-15'], ['2027-01-16', '2027-01-20'], ['2027-01-21', '2027-03-31'],
    ], 'configured changes retain seven root periods');
    assert.deepEqual(value.priceFromPeriods.map(p => periodMetrics.map(k => p.priceFrom.EUR[k].amount.amountMinor)), [
      [8500, 59500, 71400], [7480, 52360, 71400], [7480, 52360, 71400], [6732, 47124, 64260],
      [6732, 47124, 64260], [7650, 53550, 64260], [8500, 59500, 71400],
    ], 'documented period winners and independently rounded metrics');
    for (const listing of value.hotelListings) assert.equal(listing.priceFromPeriods.length, 5, 'five periods at each hotel');
  }
}
const detailExamples = doc.paths['/visit-types/{visitTypeId}'].get.responses['200'].content['application/json'].examples;
for (const field of ['priceFrom', 'priceFromPeriods', 'promotions', 'available', 'unavailableReason', 'channelContent']) {
  assert.deepEqual(detailExamples['expand-hotel-price-periods'].value[field], detailExamples['one-hotel-with-price-periods'].value[field], `hotelId preserves root ${field}`);
}
{
  const filtered = detailExamples['one-hotel-with-price-periods'].value.hotelListings[0];
  const whole = clone(detailExamples['expand-hotel-price-periods'].value.hotelListings.find(h => h.hotelId === filtered.hotelId));
  delete whole.hotel;
  assert.deepEqual(filtered, whole, 'hotelId preserves the full selected listing');
}
// All examples describe the same documented data: an id cannot change its promotion.
const promotionExamples = new Map();
function assertPromotionIdentities(node) {
  if (!node || typeof node !== 'object') return;
  if (node.id && typeof node.percentage === 'number' && 'appliesTo' in node) {
    if (promotionExamples.has(node.id)) assert.deepEqual(node, promotionExamples.get(node.id), `consistent promotion ${node.id}`);
    else promotionExamples.set(node.id, node);
  }
  for (const child of Object.values(node)) assertPromotionIdentities(child);
}
assertPromotionIdentities(doc);
for (const [name, mutate, label] of [
  ['on-request', v => { v.priceFrom = null; v.hotelListings.forEach(h => { h.priceFrom = null; }); }, 'request prices cannot be suppressed'],
  ['disabled-with-price', v => { v.priceFrom = null; v.hotelListings.forEach(h => { h.priceFrom = null; }); }, 'disabled prices cannot be suppressed'],
  ['ended-with-price-periods', v => { v.priceFromPeriods = []; v.hotelListings.forEach(h => { h.priceFromPeriods = []; }); }, 'historical periods cannot be dropped'],
  ['ended-with-price-periods', v => { v.channelContent.collections.push('special_offers'); }, 'history cannot add special_offers'],
  ['expand-hotel-price-periods', v => { v.priceFromPeriods[2].priceFrom.EUR.perPersonPerStay.amount.amountMinor++; }, 'documented arithmetic cannot drift'],
  ['ended-with-price-periods', v => { v.promotions[0].to = '2026-10-14'; }, 'active promotion covers every period night'],
  ['ended-with-price-periods', v => { v.priceFromPeriods[0].priceFrom.EUR.perStay.appliedPromotionIds = []; }, 'original needs an applied discount'],
  ['ended-with-price-periods', v => { v.promotions[0].appliesTo = [{ hotelId: v.hotelListings[0].hotelId, roomTypeIds: ['6720c0a1b2c3d4e5f6a7f999'] }]; }, 'discount scope includes winning room'],
]) {
  const value = clone(detailExamples[name].value);
  mutate(value);
  assert.throws(() => { assertVisitTypeExample(value); assertDocumentedPrices(name, value); }, undefined, label);
  checked++;
}
{
  const value = clone(detailExamples['ended-with-price-periods'].value);
  value.promotions.unshift({ ...clone(value.promotions[0]), id: '6720c0a1b2c3d4e5f6a7d316', from: '2026-09-01', to: '2026-09-15' });
  assertVisitTypeExample(value);
  checked++; // includeEnded changes only the date filter; no period-reference filter exists.
}
for (const field of ['from', 'to', 'activePromotionIds', 'priceFrom']) {
  const value = clone(schemas.PriceFromPeriod.example); delete value[field];
  expectSchema('PriceFromPeriod', value, false, `period requires ${field}`);
}
for (const field of ['amount', 'original', 'nights', 'occupancy', 'hotel', 'roomTypeId', 'appliedPromotionIds']) {
  const value = clone(schemas.PriceFromPeriod.example.priceFrom.EUR.perPersonPerStay); delete value[field];
  expectSchema('PriceFromPeriodMinimum', value, false, `period minimum requires ${field}`);
}
// Hotel example: the hotel-wide group never exceeds a category group.
for (const [currency, groups] of Object.entries(schemas.Hotel.example.priceFrom)) for (const group of ['health', 'wellness']) for (const metric of ['perPersonPerNight', 'perStay']) {
  if (groups[group]) assert(groups.all[metric].amount.amountMinor <= groups[group][metric].amount.amountMinor, `${currency} all ${metric} is a minimum`);
  checked++;
}
// List examples show the default request: one page, sorted as documented.
const listExamples = path => Object.entries(doc.paths[path].get.responses['200'].content['application/json'].examples);
for (const [name, example] of listExamples('/visit-types')) {
  const { data, pagination } = example.value;
  assert.deepEqual(pagination, { limit: 25, nextCursor: null, hasMore: false, total: data.length }, `${name}: the default page lists every package`);
  const orders = data.map(v => v.webOrder);
  const placed = orders.filter(order => order !== null);
  assert.deepEqual(orders, [...[...placed].sort((a, b) => a - b), ...orders.filter(order => order === null)], `${name}: webOrder sort, unplaced packages last`);
  checked++;
}
// Hotel list example: every hotel validates, is sorted by id descending, and each of its
// minima is the cheapest matching package entry of the visit type list example.
const packages = doc.paths['/visit-types'].get.responses['200'].content['application/json'].examples['without-expansions'].value.data;
for (const [name, example] of listExamples('/hotels')) {
  const { data, pagination } = example.value;
  assert.deepEqual(pagination, { limit: 25, nextCursor: null, hasMore: false, total: data.length }, `${name}: the default page lists every hotel`);
  assert.deepEqual(data.map(h => h.id), [...data.map(h => h.id)].sort().reverse(), `${name}: default sort is id descending`);
  for (const hotel of data) {
    expectSchema('Hotel', hotel, true, `${name}: ${hotel.id}`);
    assert.equal(new Set(hotel.procedures.map(p => p.code)).size, hotel.procedures.length, `${name}: ${hotel.id} lists each procedure once`);
    for (const [currency, groups] of Object.entries(hotel.priceFrom ?? {})) {
      const entries = group => packages
        .filter(p => p.available && p.bookingMode === 'instant')
        .filter(p => group === 'all' || p.category === group)
        .flatMap(p => p.hotelListings.filter(h => h.hotelId === hotel.id && h.priceFrom?.[currency]).map(h => h.priceFrom[currency]));
      for (const group of ['health', 'wellness']) assert.equal(group in groups, entries(group).length > 0, `${name}: ${hotel.id} ${currency} ${group} only with a priced package`);
      for (const [group, pair] of Object.entries(groups)) for (const metric of ['perPersonPerNight', 'perStay']) {
        const cheapest = entries(group).map(e => e[metric]).reduce((a, b) => b.amount.amountMinor < a.amount.amountMinor ? b : a);
        assert.deepEqual(pair[metric], cheapest, `${name}: ${hotel.id} ${currency} ${group} ${metric} is the cheapest package entry`);
        checked++;
      }
    }
  }
  assert.deepEqual(data.find(h => h.id === schemas.Hotel.example.id), schemas.Hotel.example, `${name}: the Hotel example is the same hotel as in the list`);
}
// Independent arithmetic oracle for the documented composition example.
assert.equal(1000 * (1 - 0.10) * (1 - 0.15), 765);
console.log(`Visit type contract: ${checked} schema/semantic cases passed.`);
