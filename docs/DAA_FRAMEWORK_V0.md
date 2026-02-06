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

### Boundary helpers

At the core/provider boundary, prefer calling the validation helpers instead of using
`provider.getPriceSeries()` directly.

- `fetchValidatedPriceSeries(provider, request)`
  - validates the request (`symbol`, optional `start`/`end`)
  - validates the returned series (`assertValidPriceSeries`)
  - wraps errors with provider name + request context (preserves `cause`)

- `fetchValidatedPriceSeriesEnforcingRange(provider, request)`
  - does everything above
  - additionally enforces that, when a caller supplies `start`/`end`, the provider response stays within
    that inclusive window (opt-in because some providers may ignore date filters)

Example:

```ts
// Inside this repo (framework v0), prefer importing from the core barrel:
import { fetchValidatedPriceSeriesEnforcingRange } from "../src/core";

const bars = await fetchValidatedPriceSeriesEnforcingRange(provider, {
  symbol: "SPY",
  start: "2020-01-01",
  end: "2020-12-31",
});
```

This keeps downstream logic simpler and makes provider bugs actionable.
