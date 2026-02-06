# DAA Framework v0 (WIP)

The goal of **framework v0** is to make the DAA core usable as a small library with a clean boundary between:

- **Core** (signals, backtests, portfolio logic)
- **Providers** (fetch price series)
- **E2E** (wire providers + minimal UI)

This doc captures the minimum contracts so the system fails *loudly* when data is malformed.

## Provider contract: price series

A provider must return a `PriceBar[]` that satisfies `assertValidPriceSeries`:

- at least **2 bars**
- `date`:
  - non-empty string
  - format **YYYY-MM-DD**
  - valid calendar date
  - **strictly increasing** (lexicographic; relies on ISO format)
- `close`:
  - finite number
  - **> 0**

Reference implementation:

- `src/core/seriesContracts.ts`
- `src/core/providers/priceSeriesProvider.ts`

### Boundary helper

Use `fetchValidatedPriceSeries(provider, request)` to fetch + validate at the boundary.

This keeps downstream logic simpler and makes provider bugs actionable.
