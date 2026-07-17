# API Contract — `/api/v1/quick-add/*` (`impl/nextjs`)

Phase 1 output. Three new Route Handlers, all following the house pattern: `connectDb()` → `await authenticate(request)` → Zod-validate → controller (`src/server/controllers/quick-add.ts`) → `NextResponse.json`; wrapped in `withRoute`; errors are RFC 7807 Problem JSON; 401 on auth failure. IQ1/IQ2 add **no** endpoints.

## GET `/api/v1/quick-add/aliases` (IQ3)

Returns the authenticated user's full alias list (small; client caches it for the session).

- **Rate limit**: 100/min (default tier)
- **200 response**:

```json
{
  "aliases": [
    {
      "nameKey": "tortillas",
      "category": "Grains",
      "location": "pantry",
      "unit": "pack",
      "suggestedShelfLifeDays": 5
    }
  ]
}
```

- Optional fields absent when never learned; `suggestedShelfLifeDays` present only when ≥2 expiry observations exist (median).

## PUT `/api/v1/quick-add/aliases/:nameKey` (IQ3)

Upserts learned fields and/or records a shelf-life observation for `(userId, nameKey)`.

- **Rate limit**: 100/min
- **Request body** (all optional, at least one required):

```json
{
  "category": "Grains",
  "location": "pantry",
  "unit": "pack",
  "observedShelfLifeDays": 5
}
```

- **Validation**: `nameKey` (URL-decoded) non-empty ≤100 chars, lowercased server-side; `category`/`location`/`unit` ∈ existing enums (400 Problem JSON otherwise); `observedShelfLifeDays` integer 0–365, pushed FIFO into `expiryObservations` (max 5 kept).
- **200 response**: the stored alias in the same shape as the GET items.
- **Semantics**: field overwrite (a re-correction replaces the prior value). Strictly scoped to the authenticated user — cross-user access impossible by construction (FR-036 / FR-IQ-018).

## POST `/api/v1/quick-add/parse` (IQ4)

AI-assisted interpretation for a low-confidence segment. **Fail-open by contract**: any non-200 must leave the client's deterministic result in place with no user-visible error.

- **Rate limit**: 20/min per user (429 Problem JSON beyond)
- **Request body**:

```json
{ "text": "gochujang" }
```

- `text` non-empty ≤200 chars (one segment, not the full multi-item input).
- **200 response** (fields already validated server-side against the enums; any invalid field omitted — FR-IQ-020):

```json
{
  "interpretation": {
    "name": "Gochujang",
    "quantity": 1,
    "unit": "jar",
    "category": "Condiments",
    "location": "fridge",
    "shelfLifeDays": 90
  }
}
```

- `interpretation` may be `null` (assistant declined / nothing better than the deterministic parse). All fields optional except `name`.
- **503**: assistance not configured (`OPENAI_API_KEY` absent) or upstream unavailable — client treats as disabled.
- **Caching**: server-side in-memory TTL cache (1h) keyed by normalised text — repeat identical inputs never re-consult the model (FR-IQ-022).
- **Client obligations**: debounce ≥500ms; only call when the merged parse still has `category === 'Other'`; merge only into fields whose provenance is `guess` (never over `explicit`/`learned`); never delay or block submit on an in-flight request (FR-IQ-021, SC-IQ-005).

## Unchanged surfaces

Inventory POST/PUT, grocery item add, and all other `/api/v1` endpoints are untouched — quick-add continues to submit the payloads they already accept. CLAUDE.md §4's endpoint table gains the three routes above at IQ5 (doc cascade).
