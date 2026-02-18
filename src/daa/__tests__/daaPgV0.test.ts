import { afterEach, describe, expect, it } from "vitest";

import { getDaaPgUrlV0, isDaaPgEnabledV0 } from "../pg/daaPgV0";

const ORIGINAL_DAA_DB_URL = process.env.DAA_DB_URL;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_DAA_PG_MEM = process.env.DAA_PG_MEM;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_DAA_DB_URL === undefined) delete process.env.DAA_DB_URL;
  else process.env.DAA_DB_URL = ORIGINAL_DAA_DB_URL;

  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;

  if (ORIGINAL_DAA_PG_MEM === undefined) delete process.env.DAA_PG_MEM;
  else process.env.DAA_PG_MEM = ORIGINAL_DAA_PG_MEM;

  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("daa pg url guard", () => {
  it("rejects sqlite urls to enforce Postgres-only runtime", () => {
    process.env.DAA_DB_URL = "sqlite:///var/lib/daa/daa.sqlite";
    delete process.env.DATABASE_URL;

    expect(() => getDaaPgUrlV0()).toThrowError(/Postgres-only runtime/);
  });

  it("rejects non-Postgres url schemes", () => {
    process.env.DAA_DB_URL = "mysql://user:pass@localhost:3306/daa";
    delete process.env.DATABASE_URL;

    expect(() => getDaaPgUrlV0()).toThrowError(/unsupported database URL scheme/);
  });

  it("allows libpq style connection strings without a url scheme", () => {
    process.env.DAA_DB_URL = "host=127.0.0.1 port=5432 user=daa password=pass dbname=daa";
    delete process.env.DATABASE_URL;

    expect(getDaaPgUrlV0()).toBe("host=127.0.0.1 port=5432 user=daa password=pass dbname=daa");
  });

  it("normalizes sqlalchemy postgresql+psycopg urls", () => {
    process.env.DAA_DB_URL = "postgresql+psycopg://daa:pass@localhost:5432/daa";
    delete process.env.DATABASE_URL;

    expect(getDaaPgUrlV0()).toBe("postgresql://daa:pass@localhost:5432/daa");
  });

  it("falls back to DATABASE_URL and trims whitespace", () => {
    delete process.env.DAA_DB_URL;
    process.env.DATABASE_URL = "  postgresql://daa:pass@localhost:5432/daa  ";

    expect(getDaaPgUrlV0()).toBe("postgresql://daa:pass@localhost:5432/daa");
  });

  it("still rejects non-Postgres DATABASE_URL fallback schemes", () => {
    process.env.DAA_DB_URL = "   ";
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/daa";

    expect(() => getDaaPgUrlV0()).toThrowError(/unsupported database URL scheme/);
  });

  it("rejects DAA_PG_MEM outside test runtime", () => {
    delete process.env.DAA_DB_URL;
    delete process.env.DATABASE_URL;
    process.env.DAA_PG_MEM = "1";
    process.env.NODE_ENV = "production";

    expect(() => isDaaPgEnabledV0()).toThrowError(/test-only/);
  });

  it("allows DAA_PG_MEM in test runtime", () => {
    delete process.env.DAA_DB_URL;
    delete process.env.DATABASE_URL;
    process.env.DAA_PG_MEM = "1";
    process.env.NODE_ENV = "test";

    expect(isDaaPgEnabledV0()).toBe(true);
  });
});
