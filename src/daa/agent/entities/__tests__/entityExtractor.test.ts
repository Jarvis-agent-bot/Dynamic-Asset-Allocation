import { describe, it, expect } from "vitest";
import {
  extractEntitiesFromText,
  extractEntitiesFromTags,
  extractEntitiesFromMemory,
  extractEntitiesFromThesis,
} from "../entityExtractor";

describe("entityExtractor", () => {
  describe("extractEntitiesFromText", () => {
    it("抽取 assetKey + 对应 ticker", () => {
      const out = extractEntitiesFromText("看多 US::NVDA 的 AI 基础设施");
      expect(out).toContainEqual({ kind: "asset", value: "US::NVDA" });
      expect(out).toContainEqual({ kind: "ticker", value: "NVDA" });
    });

    it("抽取港股 symbol", () => {
      const out = extractEntitiesFromText("0700.HK 腾讯新高");
      expect(out).toContainEqual({ kind: "ticker", value: "0700.HK" });
    });

    it("抽取 risk_off regime（中英）", () => {
      const en = extractEntitiesFromText("risk_off environment");
      const cn = extractEntitiesFromText("当前市场进入避险模式");
      expect(en).toContainEqual({ kind: "regime", value: "risk_off" });
      expect(cn).toContainEqual({ kind: "regime", value: "risk_off" });
    });

    it("抽取 news_source", () => {
      const out = extractEntitiesFromText("根据路透报道，NVDA 业绩超预期");
      expect(out).toContainEqual({ kind: "news_source", value: "reuters" });
    });

    it("过滤英语停用词（不把 THE/AND/FOR 识别为 ticker）", () => {
      const out = extractEntitiesFromText("THE AND FOR WITH");
      expect(out.filter(e => e.kind === "ticker")).toEqual([]);
    });

    it("过滤金融缩写（PE/ETF 不是 ticker）", () => {
      const out = extractEntitiesFromText("PE 10 倍 ETF 份额");
      expect(out.filter(e => e.kind === "ticker")).toEqual([]);
    });

    it("识别有效 US ticker（NVDA/AAPL）", () => {
      const out = extractEntitiesFromText("对比 NVDA AAPL 表现");
      expect(out).toContainEqual({ kind: "ticker", value: "NVDA" });
      expect(out).toContainEqual({ kind: "ticker", value: "AAPL" });
    });

    it("空字符串返回空数组", () => {
      expect(extractEntitiesFromText("")).toEqual([]);
    });
  });

  describe("extractEntitiesFromTags", () => {
    it("UUID tag → thesis_id", () => {
      const out = extractEntitiesFromTags(["12345678-1234-1234-1234-123456789abc"]);
      expect(out).toContainEqual({
        kind: "thesis_id",
        value: "12345678-1234-1234-1234-123456789abc",
      });
    });

    it("非 UUID tag → strategy_tag", () => {
      const out = extractEntitiesFromTags(["个股", "AI基建"]);
      expect(out).toContainEqual({ kind: "strategy_tag", value: "个股" });
      expect(out).toContainEqual({ kind: "strategy_tag", value: "AI基建" });
    });

    it("空 / null 输入安全", () => {
      expect(extractEntitiesFromTags([])).toEqual([]);
      expect(extractEntitiesFromTags(["  ", ""])).toEqual([]);
    });
  });

  describe("extractEntitiesFromMemory", () => {
    it("合并 content + tags + thread 信息，去重", () => {
      const out = extractEntitiesFromMemory({
        content: "NVDA 超预期",
        relevanceTags: ["AI基建"],
        thread: {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          assetKeys: ["US::NVDA"],
          tags: ["个股"],
        },
      });
      const kinds = out.map(e => `${e.kind}::${e.value}`);
      expect(kinds).toContain("asset::US::NVDA");
      expect(kinds).toContain("ticker::NVDA");
      expect(kinds).toContain("thesis_id::aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      expect(kinds).toContain("strategy_tag::AI基建");
      expect(kinds).toContain("strategy_tag::个股");
      // 不应有重复
      expect(new Set(kinds).size).toBe(kinds.length);
    });
  });

  describe("extractEntitiesFromThesis", () => {
    it("从 title + text + assetKeys + tags 中抽取完整实体", () => {
      const out = extractEntitiesFromThesis({
        id: "11111111-2222-3333-4444-555555555555",
        title: "看多腾讯 0700.HK",
        thesisText: "在 risk_off 环境下，根据彭博 / reuters 报道",
        assetKeys: ["HK::0700.HK"],
        tags: ["港股"],
      });
      const kinds = new Set(out.map(e => `${e.kind}::${e.value}`));
      expect(kinds.has("thesis_id::11111111-2222-3333-4444-555555555555")).toBe(true);
      expect(kinds.has("asset::HK::0700.HK")).toBe(true);
      expect(kinds.has("ticker::0700.HK")).toBe(true);
      expect(kinds.has("regime::risk_off")).toBe(true);
      expect(kinds.has("news_source::bloomberg")).toBe(true);
      expect(kinds.has("news_source::reuters")).toBe(true);
      expect(kinds.has("strategy_tag::港股")).toBe(true);
    });
  });
});
