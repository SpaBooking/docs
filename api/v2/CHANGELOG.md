# API v2 changelog

## 2026-09-18

### Hotel and room type images

- Added `width`, `height`, localized `alt`, and `variants` to every image,
  including room types embedded in a hotel response. Existing `url` and
  `thumbnailUrl` fields retain their behavior.
- `variants` contains available WebP URLs at widths 480, 960, 1440, and 1920.
  Sizes larger than the original are omitted. Use `url` when no variants exist.
- Unavailable dimensions are explicitly `null`; unavailable variants are `{}`.
- `alt` follows `Accept-Language`. Missing translations fall back to the hotel
  name or room category. Preserve an explicit empty string for decorative images.
- `thumbnailUrl` is deprecated and remains available throughout API v2.

## 2026-09-10

### Hotels

- **Breaking:** `priceFrom` replaces `perNight`, `perNightOriginal`,
  `minimumStay`, `minimumStayOriginal`, `guests`, and `minimumNights`. Under
  each currency there is now the hotel-wide price `all` and the categories
  `health` and `wellness`, each carrying two independent minima:
  `perPersonPerNight` and `perStay`. Every minimum reports
  its own `amount`, `original`, `nights`, `occupancy`, and `visitType`. See
  [Prices](/api/prices).
- A category is omitted when the hotel sells nothing in it. `all` includes
  visit types that have no category yet, so it can be lower than both
  categories.
- A promotion lowers a "from" price only when it covers the whole stay.
- Visit types whose selling period has ended no longer contribute a "from"
  price.
- Send `Accept-Language`: `priceFrom` embeds visit type names, and without the
  header every name is returned in all four locales.
- The category behind `health` and `wellness` is exposed in API v1 as
  `stay_category` on every visit type object.

## 2026-07-28

### Amenities

- `GET /amenity-categories` always includes each amenity's `options` list. The
  `expand=options` query parameter is removed; option definitions are returned
  by default.
- Hotel amenity values now return the category, the amenity, and each selected
  option by `code` only; localized labels come from the dictionary. This drops
  the inline `category.label` and per-option `label` that hotel responses
  previously carried.
- `GET /hotels` and `GET /hotels/{hotelId}` accept `expand=amenityLabels`, which
  inlines the localized `label` on each amenity category, amenity, and selected
  option for a self-contained response. `expand` accepts a comma-separated list.

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
