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
const base = doc.paths['/visit-types/{visitTypeId}'].get.responses['200'].content['application/json'].examples.default.value;
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
for (const field of ['category','payer','board','stayLength','arrival']) {
  expectSchema('VisitType', changed(v => { delete v[field]; }), false, `required ${field}`);
}
expectSchema('VisitType', changed(v => { v.stayLength = null; }), false, 'length never null');
expectSchema('VisitType', changed(v => { v.board.meals = null; }), false, 'meals never null');
expectSchema('VisitType', changed(v => { v.shortDescription.de = 'x'.repeat(121); }), false, 'short text limit');
expectSchema('VisitType', changed(v => { v.available = false; }), false, 'unavailable needs reason');
expectSchema('VisitType', changed(v => { v.unavailableReason = 'disabled'; }), false, 'available needs null reason');
expectSchema('VisitType', changed(v => { v.available = false; v.unavailableReason = 'withdrawn'; }), false, 'old reason removed');
expectSchema('VisitType', changed(v => { v.stayLength.max = null; }), true, 'unlimited length');

const arrivals = [
  [{ type:'weekdays', weekdays:['monday'] }, true],
  [{ type:'dates', dates:['2026-12-22'] }, true],
  [{ type:'dates', dates:[] }, true],
  [{ type:'weekdays', weekdays:[] }, false],
  [{ type:'weekdays', weekdays:['sunday','sunday'] }, false],
  [{ type:'weekdays', weekdays:['sunday'], dates:[] }, false],
  [{ type:'dates', dates:['2026-12-22'], weekdays:[] }, false],
  [{ weekdays:['sunday'] }, false],
  [{ type:'dates', dates:['2026-02-30'] }, false],
  [{ type:'any' }, false],
];
for (const [value, valid] of arrivals) expectSchema('VisitTypeArrival', value, valid, JSON.stringify(value));
const procedure = clone(base.treatment.procedures.items[0]);
delete procedure.count;
expectSchema('Procedure', procedure, true, 'hotel procedure');
expectSchema('Procedure', { ...procedure, count:2 }, false, 'hotel procedure has no count');
expectSchema('TreatmentProcedure', { ...procedure, count:2 }, true, 'treatment procedure count');
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
for (const exam of ['interim','final']) for (const [included, threshold, valid] of [
  [false, null, true], [false, 14, false], [true, null, true], [true, 14, true],
]) {
  expectSchema('VisitType', changed(v => {
    v.treatment.exams[exam] = included;
    v.treatment.exams[`${exam}FromNights`] = threshold;
  }), valid, `${exam} included ${included}, threshold ${threshold}`);
}
const shared = base.priceFrom.CZK.perStay;
expectSchema('SharedPriceFromMinimum', shared, true, 'shared minimum');
for (const field of ['hotel','visitType']) {
  const value = clone(shared); delete value[field];
  expectSchema('SharedPriceFromMinimum', value, false, `shared minimum requires ${field}`);
}
const liveMinimum = clone(shared); delete liveMinimum.hotel;
expectSchema('PriceFromMinimum', liveMinimum, true, 'live hotel remains valid without draft hotel reference');
const draftHotel = clone(schemas.Hotel.example);
draftHotel.procedures = [procedure];
draftHotel.priceFrom = { CZK: { all: clone(base.priceFrom.CZK) } };
expectSchema('DraftHotel', draftHotel, true, 'future hotel uses shared minimum and count-free procedures');
delete draftHotel.priceFrom.CZK.all.perStay.hotel;
expectSchema('DraftHotel', draftHotel, false, 'future hotel minimum requires hotel reference');
expectSchema('DraftHotel', schemas.Hotel.example, false, 'live hotel is not advertised as the future shape');
expectSchema('VisitTypePriceFrom', {}, false, 'empty map is not a price');
expectSchema('VisitTypeAtHotel', { hotelId:base.hotels[0].hotelId, priceFrom:null }, true, 'hotel without an offer');

// Check semantic response invariants that OpenAPI 3.0 cannot express. This is
// an example validator, not the planned price/date engine or API implementation.
const mealOrder = ['breakfast','lunch','dinner','all_inclusive'];
export function assertVisitTypeExample(value, { hotelFiltered = false } = {}) {
  assert.deepEqual(value.board.meals.map(row=>row.meal), mealOrder, 'server emits each meal once in canonical order');
  if (value.board.meals[3].included) assert(value.board.meals.slice(0,3).every(row=>row.included), 'all inclusive includes each meal');
  assert(value.stayLength.max === null || value.stayLength.max >= value.stayLength.min, 'max >= min');
  if (value.validity) for (const p of value.validity) assert(p.from <= p.to, 'valid period order');
  if (value.arrival.type === 'dates') assert.deepEqual(value.arrival.dates, [...new Set(value.arrival.dates)].sort(), 'arrival date order');
  const unpriced = !value.available || value.bookingMode === 'request';
  if (unpriced) assert.equal(value.priceFrom, null, 'unavailable/request package price');
  const ids = new Set(value.hotels.map(h=>h.hotelId));
  assert.equal(ids.size, value.hotels.length, 'distinct hotel entries');
  const currencyKeys = prices => Object.keys(prices ?? {}).sort();
  const unionCurrencies = rows => [...new Set(rows.flatMap(row=>currencyKeys(row.priceFrom)))].sort();
  const checkMinimum = (minimum, currency, hotelId) => {
    if (hotelId) assert.equal(minimum.hotel.id,hotelId,'minimum hotel identity');
    assert.equal(minimum.visitType.id,value.id,'minimum visit type identity');
    assert.equal(minimum.amount.currency,currency,'price currency key');
    if (minimum.original) assert.equal(minimum.original.currency,currency,'original currency');
  };
  if (!hotelFiltered) assert.deepEqual(currencyKeys(value.priceFrom),unionCurrencies(value.hotels),'aggregate has exactly hotel currencies');
  for (const [currency, pair] of Object.entries(value.priceFrom ?? {})) for (const metric of ['perPersonPerNight','perStay']) checkMinimum(pair[metric],currency);
  for (const h of value.hotels) {
    if (h.hotel) assert.equal(h.hotel.id,h.hotelId, 'expanded hotel identity');
    if (unpriced) assert.equal(h.priceFrom,null, 'unavailable/request pair price');
    for (const [currency, pair] of Object.entries(h.priceFrom ?? {})) for (const metric of ['perPersonPerNight','perStay']) {
      const minimum = pair[metric];
      assert.equal(minimum.hotel.id,h.hotelId,'pair hotel identity');
      assert.equal(minimum.visitType.id,value.id,'pair visit type identity');
      assert.equal(minimum.amount.currency,currency,'price currency key');
      if (minimum.original) assert.equal(minimum.original.currency,currency,'original currency');
    }
    if (h.seasons) {
      assert.deepEqual(currencyKeys(h.priceFrom),unionCurrencies(h.seasons),'pair has exactly seasonal currencies');
      assert.equal(new Set(h.seasons.map(s=>s.id)).size,h.seasons.length,'distinct season identities per hotel');
      const order = h.seasons.map(s=>`${s.from}/${s.to}/${s.id}`);
      assert.deepEqual(order,[...order].sort(),'season order');
      for (const season of h.seasons) {
        assert(season.from <= season.to,'season date order');
        if (unpriced) assert.equal(season.priceFrom,null,'unavailable/request season price');
        for (const [currency, pair] of Object.entries(season.priceFrom ?? {})) for (const metric of ['perPersonPerNight','perStay']) checkMinimum(pair[metric],currency,h.hotelId);
      }
      for (const [currency, pair] of Object.entries(h.priceFrom ?? {})) for (const metric of ['perPersonPerNight','perStay']) {
        const amounts = h.seasons.flatMap(s=>s.priceFrom?.[currency] ? [s.priceFrom[currency][metric].amount.amountMinor] : []);
        assert(amounts.length > 0,'pair offer has a season');
        assert.equal(pair[metric].amount.amountMinor,Math.min(...amounts),'pair is seasonal minimum');
      }
    }
  }
  if (!hotelFiltered) for (const [currency, pair] of Object.entries(value.priceFrom ?? {})) for (const metric of ['perPersonPerNight','perStay']) {
    const amounts = value.hotels.flatMap(h=>h.priceFrom?.[currency] ? [h.priceFrom[currency][metric].amount.amountMinor] : []);
    assert(amounts.length > 0,'aggregate offer has a hotel');
    assert.equal(pair[metric].amount.amountMinor,Math.min(...amounts),'aggregate is hotel minimum');
    assert(ids.has(pair[metric].hotel.id),'aggregate hotel belongs to package');
    assert.equal(pair[metric].visitType.id,value.id,'aggregate visit type identity');
  }
  assert.equal(new Set(value.promotions.map(p=>p.id)).size,value.promotions.length,'distinct promotion identity');
  for (const p of value.promotions) assert(p.to === null || p.from <= p.to,'promotion date order');
  for (const key of ['deposit','loyaltyPrograms','departure','hotelIds','meals','stayCategory','paymentType']) assert(!(key in value),`removed field ${key}`);
}
function expectSemantics(value, valid, label) {
  checked++;
  if(valid) assert.doesNotThrow(()=>assertVisitTypeExample(value),label);
  else assert.throws(()=>assertVisitTypeExample(value),undefined,label);
}
expectSemantics(base,true,'default semantics');
expectSemantics(changed(v=>{v.board.meals[3].included=true;}),false,'inconsistent all inclusive');
expectSemantics(changed(v=>{v.board.meals[1].meal='breakfast';}),false,'duplicate meal code');
expectSemantics(changed(v=>{v.stayLength.max=0;}),false,'invalid min/max relation');
expectSemantics(changed(v=>{v.hotels[1].priceFrom.CZK.perStay.amount.amountMinor+=1;}),false,'aggregate mismatch');
expectSemantics(changed(v=>{v.priceFrom=null;}),false,'aggregate cannot omit a priced hotel');
expectSemantics(changed(v=>{v.promotions.push(clone(v.promotions[0]));}),false,'duplicate promotion');
for(const field of ['deposit','loyaltyPrograms','departure','hotelIds','meals','stayCategory','paymentType']) {
  assert(!(field in schemas.VisitType.properties),`removed schema property ${field}`);
}
assert(!('channel' in schemas.Promotion.properties),'no public promotion channel');
assert(!('procedures' in schemas.Hotel.properties),'live hotel does not advertise draft procedures');
assert(!('hotel' in schemas.PriceFromMinimum.properties),'live hotel minimum unchanged');
assert(!('minNights' in schemas.VisitTypeStayLength.properties));
assert(!('maxNights' in schemas.VisitTypeStayLength.properties));
assert.deepEqual(schemas.VisitTypeWeekdayArrival.additionalProperties,false);
assert.deepEqual(schemas.VisitTypeDateArrival.additionalProperties,false);
for (const path of ['/visit-types','/visit-types/{visitTypeId}']) {
  const operation = doc.paths[path].get;
  const parameters = operation.parameters.filter(p=>p.name);
  const detail = path.includes('{');
  assert.deepEqual(parameters.find(p=>p.name==='expand').schema.items.enum,detail?['hotels','seasons']:['hotels']);
  if(!detail) {
    for(const field of ['category','payer','board']) assert(parameters.some(p=>p.name===field));
    for(const field of ['stayCategory','paymentType','meal']) assert(!parameters.some(p=>p.name===field));
  }
  const examples = operation.responses['200'].content['application/json'].examples;
  assert(examples.default && examples.expandedHotels,'both expand variants');
  for (const [name, example] of Object.entries(examples)) {
    const values = detail ? [example.value] : example.value.data;
    for(const value of values) { assertVisitTypeExample(value,{hotelFiltered:name==='filteredSeasons'}); checked++; }
  }
}
// Independent arithmetic oracle for the documented composition example.
assert.equal(1000 * (1 - 0.10) * (1 - 0.15),765);
console.log(`Visit type draft contract: ${checked} schema/semantic cases passed.`);
