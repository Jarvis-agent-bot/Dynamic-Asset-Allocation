import { describe, expect, it } from "vitest";
import { normalizeOrderSizing } from "./orderSizing";

describe("orderSizing", () => {
  it("按价格精度拦截过小价格，避免生成不可成交订单", () => {
    const result = normalizeOrderSizing({
      side: "BUY",
      market: "US",
      price: 0.0000001,
      fxRateToBase: 1,
      qty: 100,
      minNotionalBase: 0,
    });

    expect(result.qty).toBe(0);
    expect(result.price).toBe(0);
    expect(result.warnings.join(" ")).toContain("价格低于最小报价精度");
  });

  it("按数量步长向下取整，避免提交超精度数量", () => {
    const result = normalizeOrderSizing({
      side: "BUY",
      market: "US",
      price: 10,
      fxRateToBase: 1,
      qty: 1.123456789,
      minNotionalBase: 0,
    });

    expect(result.qty).toBe(1.123456);
    expect(result.notionalBase).toBeCloseTo(11.23456, 8);
    expect(result.warnings.join(" ")).toContain("数量按下单步长向下取整");
  });

  it("100% 卖出保留完整持仓数量，不被 6 位小数截断", () => {
    const result = normalizeOrderSizing({
      side: "SELL",
      market: "CRYPTO",
      price: 100,
      fxRateToBase: 1,
      qty: 0.123456,
      holdingQty: 0.123456789,
      sellAll: true,
      minNotionalBase: 0,
    });

    expect(result.sellAll).toBe(true);
    expect(result.qty).toBe(0.123456789);
  });

  it("执行价变化后可以按目标金额重算数量", () => {
    const result = normalizeOrderSizing({
      side: "SELL",
      market: "US",
      price: 90,
      fxRateToBase: 1,
      notionalBase: 900,
      holdingQty: 20,
      minNotionalBase: 0,
    });

    expect(result.qty).toBe(10);
    expect(result.notionalBase).toBe(900);
  });

  it("低于最小成交额的非清仓订单会被压掉", () => {
    const result = normalizeOrderSizing({
      side: "BUY",
      market: "US",
      price: 5,
      fxRateToBase: 1,
      qty: 1,
      minNotionalBase: 10,
    });

    expect(result.qty).toBe(0);
    expect(result.warnings.join(" ")).toContain("低于最小成交额");
  });
});
