# API v2 changelog

## 2026-07-27

### Amenities

- `GET /amenity-categories` supports conditional revalidation: responses carry
  an `ETag` and `Cache-Control: private, max-age=3600`, and a request with a
  matching `If-None-Match` returns `304` without a body.
- `GET /amenity-categories`, `GET /hotels`, and `GET /hotels/{hotelId}` return
  the `X-SpaPortal-Amenities-Version` header. The value changes only when the
  dictionary content changes; refetch the dictionary when it differs from the
  cached version.

## 2026-07-24

### Hotels

- `priceFrom` now returns the cheapest available current or future room price
  for the room's standard occupancy. It includes nightly and minimum-stay
  totals, occupancy, and minimum nights for each available currency. Hotels
  without a usable price return `null`. Applicable public-channel promotions
  are included together with their original prices.

### Amenities

- The amenity dictionary is available from `GET /amenity-categories`. Each item
  in `data` contains `category` and an `amenities` array.
- Hotel responses expose assigned amenity values under `amenityCategories`.
  Categories without assigned amenities are omitted.
- Amenity option definitions are omitted from the dictionary by default. Use
  `expand=options` to include every supported choice and its localized label.
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
- Dictionary entries with an empty `detailKinds` array are presence-only. Their
  hotel values contain only `code`.

## 2026-07-23

### Hotels and amenities

- Added `GET /hotels`.
- Added `GET /hotels/{hotelId}`.
- Added `GET /amenity-categories`.
- Hotel responses include localized `shortDescription` and
  `channelContent.tagline`, structured accommodation rules and meal services,
  ordered indication codes, staff language codes, and structured amenities.

### Room types

- Invalid cursors, cursors created for another sort mode, and cursors belonging to another resource now return `400` instead of silently restarting pagination.
- Empty localized strings are returned as `null`.
- Empty `code` and `search` query parameters are treated as omitted parameters.

Legacy room-type cursors using `lastSortValue` remain supported.
