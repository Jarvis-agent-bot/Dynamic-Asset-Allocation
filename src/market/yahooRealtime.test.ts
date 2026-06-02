import { describe, expect, it } from "vitest";

import { decodeYahooPricingDataMessage } from "./yahooRealtime";

function varint(value: number | bigint): number[] {
  const out: number[] = [];
  let n = BigInt(value);
  while (n >= 0x80n) {
    out.push(Number((n & 0x7fn) | 0x80n));
    n >>= 7n;
  }
  out.push(Number(n));
  return out;
}

function zigzag(value: number): bigint {
  const n = BigInt(value);
  return n >= 0n ? n * 2n : (-n * 2n) - 1n;
}

function fieldKey(field: number, wireType: number): number[] {
  return varint((field << 3) | wireType);
}

function stringField(field: number, value: string): number[] {
  const bytes = [...Buffer.from(value, "utf8")];
  return [...fieldKey(field, 2), ...varint(bytes.length), ...bytes];
}

function sint64Field(field: number, value: number): number[] {
  return [...fieldKey(field, 0), ...varint(zigzag(value))];
}

function floatField(field: number, value: number): number[] {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(value, 0);
  return [...fieldKey(field, 5), ...buffer];
}

function yahooWsEnvelope(bytes: number[]): string {
  return JSON.stringify({ message: Buffer.from(bytes).toString("base64") });
}

describe("yahooRealtime", () => {
  it("解码 Yahoo streamer PricingData 里图表需要的实时报价字段", () => {
    const message = yahooWsEnvelope([
      ...stringField(1, "AMD"),
      ...floatField(2, 510.13),
      ...sint64Field(3, 1_780_375_800),
      ...stringField(4, "USD"),
      ...floatField(8, 1.25),
      ...sint64Field(9, 33_160_000),
      ...floatField(10, 517.5),
      ...floatField(11, 486.8),
      ...floatField(12, 6.3),
      ...floatField(15, 500.36),
      ...floatField(16, 503.83),
    ]);

    expect(decodeYahooPricingDataMessage(message)).toEqual({
      symbol: "AMD",
      price: expect.closeTo(510.13, 0.001),
      ts: "2026-06-02T04:50:00.000Z",
      currency: "USD",
      change: expect.closeTo(6.3, 0.001),
      changePercent: expect.closeTo(1.25, 0.001),
      dayVolume: 33_160_000,
      dayHigh: expect.closeTo(517.5, 0.001),
      dayLow: expect.closeTo(486.8, 0.001),
      openPrice: expect.closeTo(500.36, 0.001),
      previousClose: expect.closeTo(503.83, 0.001),
      source: "yahoo_streamer",
    });
  });

  it("无法解析的 Yahoo streamer 消息返回 null，避免中断 SSE 流", () => {
    expect(decodeYahooPricingDataMessage("{\"message\":\"not-base64\"}")).toBeNull();
    expect(decodeYahooPricingDataMessage("not-json")).toBeNull();
  });

  it("兼容 Yahoo streamer 毫秒级 epoch，避免把时间解析到未来年份", () => {
    const message = yahooWsEnvelope([
      ...stringField(1, "AMD"),
      ...floatField(2, 503.25),
      ...sint64Field(3, 1_780_375_800_000),
      ...stringField(4, "USD"),
    ]);

    expect(decodeYahooPricingDataMessage(message)?.ts).toBe("2026-06-02T04:50:00.000Z");
  });
});
