# API v2 changelog

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
