"use client";

import { readJsonFromLs } from "./wizardStorage";

export const LS_TAG_TAXONOMY = "daa.step7.tagTaxonomy";

export type TagAppliesTo = "human" | "marketEvent" | "signals" | "moneyPlan" | "recommendation";

export type TagValue = {
  key: string;
  label?: string;
  desc?: string;
};

export type TagDefinition = {
  key: string;
  label: string;
  desc?: string;
  multi?: boolean;
  appliesTo?: TagAppliesTo[];
  values: TagValue[];
};

export type TagTaxonomy = {
  version: 1;
  tags: TagDefinition[];
};

export const DEFAULT_TAG_TAXONOMY: TagTaxonomy = {
  version: 1,
  tags: [
    {
      key: "riskPreference",
      label: "Risk Preference",
      desc: "Subjective preference; used in Step6/strategy selection.",
      appliesTo: ["human"],
      values: [
        { key: "high", label: "High" },
        { key: "mid", label: "Mid" },
        { key: "low", label: "Low" },
      ],
    },
    {
      key: "riskScore",
      label: "Risk Score",
      desc: "Performance-based score (v0 manual input).",
      appliesTo: ["human"],
      values: [
        { key: "high", label: "High" },
        { key: "mid", label: "Mid" },
        { key: "low", label: "Low" },
        { key: "sb", label: "SB", desc: 'the "傻逼" bucket' },
      ],
    },
    {
      key: "eventTags",
      label: "Event Tags",
      desc: "Common tags for MarketEvent normalization (Step2).",
      appliesTo: ["marketEvent"],
      multi: true,
      values: [
        { key: "macro" },
        { key: "rates" },
        { key: "earnings" },
        { key: "policy" },
        { key: "liquidity" },
        { key: "risk-on" },
        { key: "risk-off" },
      ],
    },
  ],
};

export function isValidTagTaxonomy(x: unknown): x is TagTaxonomy {
  const v = x as any;
  if (!v || typeof v !== "object") return false;
  if (v.version !== 1) return false;
  if (!Array.isArray(v.tags)) return false;

  for (const t of v.tags) {
    if (!t || typeof t !== "object") return false;
    if (!t.key || typeof t.key !== "string") return false;
    if (!t.label || typeof t.label !== "string") return false;
    if (!Array.isArray(t.values)) return false;
    for (const tv of t.values) {
      if (!tv || typeof tv !== "object") return false;
      if (!tv.key || typeof tv.key !== "string") return false;
    }
  }

  return true;
}

export function loadTagTaxonomy(): TagTaxonomy {
  const stored = readJsonFromLs<TagTaxonomy>(LS_TAG_TAXONOMY);
  if (isValidTagTaxonomy(stored)) return stored;
  return DEFAULT_TAG_TAXONOMY;
}

export function getTagDef(taxonomy: TagTaxonomy | null | undefined, tagKey: string): TagDefinition | null {
  const tags = taxonomy?.tags || [];
  for (const t of tags) {
    if (t?.key === tagKey) return t;
  }
  return null;
}

export function getAllowedValueKeys(t: TagDefinition | null | undefined): string[] {
  const keys = new Set<string>();
  for (const v of t?.values || []) {
    const k = String(v?.key || "").trim();
    if (k) keys.add(k);
  }
  return [...keys];
}

export function getAllowedValueKeySetForAppliesTo(taxonomy: TagTaxonomy | null | undefined, appliesTo: TagAppliesTo): Set<string> {
  const out = new Set<string>();
  for (const t of taxonomy?.tags || []) {
    if (!t?.appliesTo?.includes(appliesTo)) continue;
    for (const v of t.values || []) {
      const k = String(v?.key || "").trim();
      if (k) out.add(k);
    }
  }
  return out;
}
