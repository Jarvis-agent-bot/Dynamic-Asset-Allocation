import type { DaaStoreCandidateAsset, DaaStoreEquitySnapshot, DaaStoreFxRate } from "@/src/daa/store/storeTypes";

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; message: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type DaaFxRateWriteInput = Pick<DaaStoreFxRate, "baseCcy" | "quoteCcy" | "rate">
  & Partial<Pick<DaaStoreFxRate, "id" | "source" | "asOfTs">>;

export type DaaCandidateAssetWriteInput = Pick<DaaStoreCandidateAsset, "symbol">
  & Partial<Pick<DaaStoreCandidateAsset, "market" | "currency" | "enabled" | "targetWeightHint" | "tags" | "notes">>;

export type DaaEquitySnapshotWriteInput = Pick<DaaStoreEquitySnapshot, "totalEquity" | "holdingsValue" | "cash">
  & Partial<Pick<DaaStoreEquitySnapshot, "ts" | "source">>;

function ok<T>(value: T): ParseOk<T> {
  return { ok: true, value };
}

function err(message: string): ParseErr {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredString(row: Record<string, unknown>, key: string, path: string): ParseResult<string> {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    return err(`${path}.${key} must be a non-empty string`);
  }
  return ok(value.trim());
}

function readOptionalString(row: Record<string, unknown>, key: string, path: string): ParseResult<string | undefined> {
  if (!Object.prototype.hasOwnProperty.call(row, key) || row[key] == null) return ok(undefined);
  const value = row[key];
  if (typeof value !== "string") return err(`${path}.${key} must be a string`);
  return ok(value.trim());
}

function readRequiredFiniteNumber(row: Record<string, unknown>, key: string, path: string): ParseResult<number> {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return err(`${path}.${key} must be a finite number`);
  }
  return ok(value);
}

function readOptionalFiniteNumber(row: Record<string, unknown>, key: string, path: string): ParseResult<number | undefined> {
  if (!Object.prototype.hasOwnProperty.call(row, key) || row[key] == null) return ok(undefined);
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return err(`${path}.${key} must be a finite number`);
  }
  return ok(value);
}

function readOptionalBoolean(row: Record<string, unknown>, key: string, path: string): ParseResult<boolean | undefined> {
  if (!Object.prototype.hasOwnProperty.call(row, key) || row[key] == null) return ok(undefined);
  const value = row[key];
  if (typeof value !== "boolean") return err(`${path}.${key} must be a boolean`);
  return ok(value);
}

function readOptionalStringArray(row: Record<string, unknown>, key: string, path: string): ParseResult<string[] | undefined> {
  if (!Object.prototype.hasOwnProperty.call(row, key) || row[key] == null) return ok(undefined);
  const value = row[key];
  if (!Array.isArray(value)) return err(`${path}.${key} must be a string array`);
  const tags: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string") return err(`${path}.${key}[${index}] must be a string`);
    const tag = item.trim();
    if (tag) tags.push(tag);
  }
  return ok(tags);
}

export function parseDaaFxRateInputs(value: unknown): ParseResult<DaaFxRateWriteInput[]> {
  if (!Array.isArray(value)) return err("rates must be an array");
  const rows: DaaFxRateWriteInput[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const path = `rates[${index}]`;
    if (!isRecord(raw)) return err(`${path} must be an object`);

    const baseCcy = readRequiredString(raw, "baseCcy", path);
    if (!baseCcy.ok) return baseCcy;
    const quoteCcy = readRequiredString(raw, "quoteCcy", path);
    if (!quoteCcy.ok) return quoteCcy;
    const rate = readRequiredFiniteNumber(raw, "rate", path);
    if (!rate.ok) return rate;
    if (rate.value <= 0) return err(`${path}.rate must be greater than 0`);

    const row: DaaFxRateWriteInput = {
      baseCcy: baseCcy.value,
      quoteCcy: quoteCcy.value,
      rate: rate.value,
    };

    const id = readOptionalString(raw, "id", path);
    if (!id.ok) return id;
    const source = readOptionalString(raw, "source", path);
    if (!source.ok) return source;
    const asOfTs = readOptionalString(raw, "asOfTs", path);
    if (!asOfTs.ok) return asOfTs;
    if (id.value !== undefined) row.id = id.value;
    if (source.value !== undefined) row.source = source.value;
    if (asOfTs.value !== undefined) row.asOfTs = asOfTs.value;

    rows.push(row);
  }

  return ok(rows);
}

export function parseDaaCandidateAssetInputs(value: unknown): ParseResult<DaaCandidateAssetWriteInput[]> {
  if (!Array.isArray(value)) return err("candidates must be an array");
  const rows: DaaCandidateAssetWriteInput[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const path = `candidates[${index}]`;
    if (!isRecord(raw)) return err(`${path} must be an object`);

    const symbol = readRequiredString(raw, "symbol", path);
    if (!symbol.ok) return symbol;

    const row: DaaCandidateAssetWriteInput = {
      symbol: symbol.value,
    };

    const market = readOptionalString(raw, "market", path);
    if (!market.ok) return market;
    const currency = readOptionalString(raw, "currency", path);
    if (!currency.ok) return currency;
    const enabled = readOptionalBoolean(raw, "enabled", path);
    if (!enabled.ok) return enabled;
    const targetWeightHint = readOptionalFiniteNumber(raw, "targetWeightHint", path);
    if (!targetWeightHint.ok) return targetWeightHint;
    if (targetWeightHint.value != null && targetWeightHint.value < 0) return err(`${path}.targetWeightHint must be >= 0`);
    const tags = readOptionalStringArray(raw, "tags", path);
    if (!tags.ok) return tags;
    const notes = readOptionalString(raw, "notes", path);
    if (!notes.ok) return notes;

    if (market.value !== undefined) row.market = market.value;
    if (currency.value !== undefined) row.currency = currency.value;
    if (enabled.value !== undefined) row.enabled = enabled.value;
    if (targetWeightHint.value !== undefined) row.targetWeightHint = targetWeightHint.value;
    if (tags.value !== undefined) row.tags = tags.value;
    if (notes.value !== undefined) row.notes = notes.value || null;

    rows.push(row);
  }

  return ok(rows);
}

export function parseDaaEquitySnapshotInput(value: unknown): ParseResult<DaaEquitySnapshotWriteInput> {
  if (!isRecord(value)) return err("snapshot must be an object");

  const totalEquity = readRequiredFiniteNumber(value, "totalEquity", "snapshot");
  if (!totalEquity.ok) return totalEquity;
  const holdingsValue = readRequiredFiniteNumber(value, "holdingsValue", "snapshot");
  if (!holdingsValue.ok) return holdingsValue;
  const cash = readRequiredFiniteNumber(value, "cash", "snapshot");
  if (!cash.ok) return cash;
  if (totalEquity.value < 0) return err("snapshot.totalEquity must be >= 0");
  if (holdingsValue.value < 0) return err("snapshot.holdingsValue must be >= 0");
  if (cash.value < 0) return err("snapshot.cash must be >= 0");

  const snapshot: DaaEquitySnapshotWriteInput = {
    totalEquity: totalEquity.value,
    holdingsValue: holdingsValue.value,
    cash: cash.value,
  };

  const ts = readOptionalString(value, "ts", "snapshot");
  if (!ts.ok) return ts;
  const source = readOptionalString(value, "source", "snapshot");
  if (!source.ok) return source;
  if (ts.value !== undefined) snapshot.ts = ts.value;
  if (source.value !== undefined) snapshot.source = source.value;

  return ok(snapshot);
}
