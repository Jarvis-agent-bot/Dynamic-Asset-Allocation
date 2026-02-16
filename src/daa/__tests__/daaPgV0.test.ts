import { afterEach, describe, expect, it } from "vitest";

import { getDaaPgUrlV0 } from "../pg/daaPgV0";

const ORIGINAL_DAA_DB_URL = process.env.DAA_DB_URL;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL_DAA_DB_URL === undefined) delete process.env.DAA_DB_URL;
  else process.env.DAA_DB_URL = ORIGINAL_DAA_DB_URL;

  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

describe("daa pg url guard", () => {
  it("rejects sqlite urls to enforce Postgres-only runtime", () => {
    process.env.DAA_DB_URL = "sqlite:///var/lib/daa/daa.sqlite";
    delete process.env.DATABASE_URL;

    expect(() => getDaaPgUrlV0()).toThrowError(/Postgres-only runtime/);
  });

  it("normalizes sqlalchemy postgresql+psycopg urls", () => {
    process.env.DAA_DB_URL = "postgresql+psycopg://daa:pass@localhost:5432/daa";
    delete process.env.DATABASE_URL;

    expect(getDaaPgUrlV0()).toBe("postgresql://daa:pass@localhost:5432/daa");
  });
});
