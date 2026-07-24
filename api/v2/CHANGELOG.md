# API v2 changelog

## 2026-07-24

### Amenities

- `GET /amenities` now groups dictionary entries by category. Each item in
  `data` contains `category` and an `amenities` array.
- Hotel responses now group assigned amenity values by category. Categories
  without assigned amenities are omitted.
- Amenity-specific choices use the generic `options` detail kind and localized
  `options` objects. This replaces the public `parking_types`, `sauna_types`,
  and `dietary_options` detail kinds and their corresponding value fields.
- Hotel amenity values now include only the detail fields mapped from the
  corresponding amenity dictionary entry's `detailKinds`. The `code` field is
  always present.
- Supported fields that are not filled retain their neutral value: scalar
  fields are `null`, arrays are empty, opening-hour blocks are empty, and
  requested note translations are `null`.
- Amenity charge information is returned exclusively through `access` using
  `included`, `conditional`, or `paid`.
- `wheelchair_access` and `ev_charging` are presence-only amenities. Their
  dictionary entries return an empty `detailKinds` array and their hotel values
  contain only `code`.

## 2026-07-23

### Hotels and amenities

- Added `GET /hotels`.
- Added `GET /hotels/{hotelId}`.
- Added `GET /amenities`.
- Hotel responses include localized `shortDescription` and
  `channelContent.tagline`, structured accommodation rules and meal services,
  ordered indication codes, staff language codes, and structured amenities.

### Room types

- Invalid cursors, cursors created for another sort mode, and cursors belonging to another resource now return `400` instead of silently restarting pagination.
- Empty localized strings are returned as `null`.
- Empty `code` and `search` query parameters are treated as omitted parameters.

Legacy room-type cursors using `lastSortValue` remain supported.
