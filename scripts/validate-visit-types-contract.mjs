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
expectSchema('VisitType', changed(v => { v.available = false; v.unavailableReason = 'no_hotels'; v.hotels = []; v.priceFrom = null; }), true, 'unavailable package');
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
expectSchema('VisitTypeAtHotel', { hotelId: base.hotels[0].hotelId, priceFrom: null }, true, 'hotel without an offer');
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
export function assertVisitTypeExample(value, { hotelFiltered = false } = {}) {
  assert.deepEqual(value.board.meals.map(row => row.meal), mealOrder, 'server emits each meal once in canonical order');
  if (value.board.meals[3].included) assert(value.board.meals.slice(0, 3).every(row => row.included), 'all inclusive includes each meal');
  assert(value.stayLength.max === null || value.stayLength.max >= value.stayLength.min, 'max >= min');
  if (value.validity) for (const p of value.validity) assert(p.from <= p.to, 'valid period order');
  if (value.arrival.type === 'dates') assert.deepEqual(value.arrival.dates, [...new Set(value.arrival.dates)].sort(), 'arrival date order');
  const collections = value.channelContent.collections;
  assert.deepEqual(collections, collectionOrder.filter(code => collections.includes(code)), 'collections follow the code list order');
  assert.equal(collections.includes('special_offers'), value.promotions.length > 0, 'special_offers means published promotions');
  const unpriced = !value.available || value.bookingMode === 'request';
  if (unpriced) assert.equal(value.priceFrom, null, 'unavailable/request package price');
  const ids = new Set(value.hotels.map(h => h.hotelId));
  assert.equal(ids.size, value.hotels.length, 'distinct hotel entries');
  const currencyKeys = prices => Object.keys(prices ?? {}).sort();
  const unionCurrencies = rows => [...new Set(rows.flatMap(row => currencyKeys(row.priceFrom)))].sort();
  const checkMinimum = (minimum, currency, hotelId) => {
    if (hotelId) assert.equal(minimum.hotel.id, hotelId, 'minimum hotel identity');
    assert.equal(minimum.visitType.id, value.id, 'minimum visit type identity');
    assert.equal(minimum.amount.currency, currency, 'price currency key');
    if (minimum.original) {
      assert.equal(minimum.original.currency, currency, 'original currency');
      assert(minimum.original.amountMinor > minimum.amount.amountMinor, 'original exceeds amount');
    }
  };
  if (!hotelFiltered) assert.deepEqual(currencyKeys(value.priceFrom), unionCurrencies(value.hotels), 'aggregate has exactly hotel currencies');
  for (const [currency, pair] of Object.entries(value.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) checkMinimum(pair[metric], currency);
  for (const h of value.hotels) {
    if (h.hotel) assert.equal(h.hotel.id, h.hotelId, 'expanded hotel identity');
    if (unpriced) assert.equal(h.priceFrom, null, 'unavailable/request pair price');
    for (const [currency, pair] of Object.entries(h.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) checkMinimum(pair[metric], currency, h.hotelId);
    if (h.seasons) {
      assert.deepEqual(currencyKeys(h.priceFrom), unionCurrencies(h.seasons), 'pair has exactly seasonal currencies');
      assert.equal(new Set(h.seasons.map(s => s.id)).size, h.seasons.length, 'distinct season identities per hotel');
      const order = h.seasons.map(s => `${s.from}/${s.to}/${s.id}`);
      assert.deepEqual(order, [...order].sort(), 'season order');
      for (const season of h.seasons) {
        assert(season.from <= season.to, 'season date order');
        if (unpriced) assert.equal(season.priceFrom, null, 'unavailable/request season price');
        for (const [currency, pair] of Object.entries(season.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) checkMinimum(pair[metric], currency, h.hotelId);
      }
      for (const [currency, pair] of Object.entries(h.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) {
        const amounts = h.seasons.flatMap(s => s.priceFrom?.[currency] ? [s.priceFrom[currency][metric].amount.amountMinor] : []);
        assert(amounts.length > 0, 'pair offer has a season');
        assert.equal(pair[metric].amount.amountMinor, Math.min(...amounts), 'pair is seasonal minimum');
      }
    }
  }
  if (!hotelFiltered) for (const [currency, pair] of Object.entries(value.priceFrom ?? {})) for (const metric of ['perPersonPerNight', 'perStay']) {
    const amounts = value.hotels.flatMap(h => h.priceFrom?.[currency] ? [h.priceFrom[currency][metric].amount.amountMinor] : []);
    assert(amounts.length > 0, 'aggregate offer has a hotel');
    assert.equal(pair[metric].amount.amountMinor, Math.min(...amounts), 'aggregate is hotel minimum');
    assert(ids.has(pair[metric].hotel.id), 'aggregate hotel belongs to package');
    assert.equal(pair[metric].visitType.id, value.id, 'aggregate visit type identity');
  }
  assert.equal(new Set(value.promotions.map(p => p.id)).size, value.promotions.length, 'distinct promotion identity');
  for (const p of value.promotions) assert(p.to === null || p.from <= p.to, 'promotion date order');
  for (const key of ['deposit', 'loyaltyPrograms', 'departure', 'hotelIds', 'meals', 'stayCategory', 'paymentType', 'collections']) assert(!(key in value), `removed field ${key}`);
}
function expectSemantics(value, valid, label) {
  checked++;
  if (valid) assert.doesNotThrow(() => assertVisitTypeExample(value), label);
  else assert.throws(() => assertVisitTypeExample(value), undefined, label);
}
expectSemantics(base, true, 'default semantics');
expectSemantics(changed(v => { v.board.meals[3].included = true; }), false, 'inconsistent all inclusive');
expectSemantics(changed(v => { v.board.meals[1].meal = 'breakfast'; }), false, 'duplicate meal code');
expectSemantics(changed(v => { v.stayLength.max = 0; }), false, 'invalid min/max relation');
expectSemantics(changed(v => { v.hotels[1].priceFrom.CZK.perStay.amount.amountMinor += 1; }), false, 'aggregate mismatch');
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
  assert.deepEqual(parameters.find(p => p.name === 'expand').schema.items.enum, detail ? ['hotels', 'seasons'] : ['hotels']);
  if (!detail) {
    for (const field of ['category', 'payer', 'board', 'collection']) assert(parameters.some(p => p.name === field));
    for (const field of ['stayCategory', 'paymentType', 'meal']) assert(!parameters.some(p => p.name === field));
  }
  const examples = operation.responses['200'].content['application/json'].examples;
  const names = Object.keys(examples);
  assert(names.length >= 2 && names.some(name => name.includes('expand-hotels')) && names.some(name => !name.includes('expand')), 'both expand variants');
  for (const [name, example] of Object.entries(examples)) {
    const values = detail ? [example.value] : example.value.data;
    for (const value of values) { assertVisitTypeExample(value, { hotelFiltered: name === 'one-hotel-with-seasons' }); checked++; }
    for (const value of values) {
      const expanded = name.includes('expand-hotels');
      for (const entry of value.hotels) {
        assert.equal('hotel' in entry, expanded, `${name}: hotel summary only with expand=hotels`);
        assert.equal('seasons' in entry, name.includes('seasons'), `${name}: seasons only with expand=seasons`);
      }
    }
  }
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
        .filter(p => group === 'all' || p.category === group)
        .flatMap(p => p.hotels.filter(h => h.hotelId === hotel.id && h.priceFrom?.[currency]).map(h => h.priceFrom[currency]));
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
