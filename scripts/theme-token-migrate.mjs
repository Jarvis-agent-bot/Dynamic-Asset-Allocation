#!/usr/bin/env node
/**
 * 一次性主题迁移：把残留的暗色字面量 / Tailwind 暗色类映射到 light theme design token。
 * 仅作用于 app/daa。幂等：重复运行无副作用（token 不会再匹配旧字面量）。
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../app/daa", import.meta.url).pathname;

/** 有序替换规则：[正则, 替换文本] —— 顺序敏感（先具体后泛化）。 */
const RULES = [
  // ── A. 暗色表面 rgba → 表面 token ──
  [/rgba\(8,12,20,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(13,19,32,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(17,24,39,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(9,1[34],24,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(10,14,22,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(12,18,30,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(6,10,18,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(5,6,7,[\d.]+\)/g, "var(--surface)"],
  [/rgba\(18,26,42,[\d.]+\)/g, "var(--elevated)"],
  [/rgba\(24,34,54,[\d.]+\)/g, "var(--elevated)"],

  // ── B. 白色叠加（暗底提亮）→ 浅灰 token ──
  [/rgba\(255,255,255,0\.0(15|2|25|3)\)/g, "var(--surface)"],
  [/rgba\(255,255,255,0\.0(4|5|6)\)/g, "var(--elevated)"],
  [/rgba\(255,255,255,0\.(08|1|15)\)/g, "var(--hover)"],

  // ── C. 旧青色/天蓝强调 → primary 橙 ──
  [/rgba\(56,189,248,0\.8\)/g, "var(--primary)"],
  [/rgba\(56,189,248,[\d.]+\)/g, "var(--primary-bg)"],
  [/rgba\(125,211,252,[\d.]+\)/g, "var(--primary)"],
  [/rgba\(246,173,85,[\d.]+\)/g, "var(--amber)"],
  [/rgba\(74,222,128,[\d.]+\)/g, "var(--success)"],

  // ── D. Tailwind 暗色类 → token 任意值 ──
  // zinc 表面/边框/文字（全是暗主题残留）
  [/\bbg-zinc-900\/40\b/g, "bg-[var(--surface)]"],
  [/\bbg-zinc-800\b/g, "bg-[var(--elevated)]"],
  [/\bbg-zinc-500\/10\b/g, "bg-[var(--muted-bg)]"],
  [/\bborder-zinc-800\b/g, "border-[var(--border)]"],
  [/\bborder-zinc-700\b/g, "border-[var(--border-strong)]"],
  [/\btext-zinc-(100|200|300)\b/g, "text-[var(--text)]"],
  [/\btext-zinc-(400|500|600)\b/g, "text-[var(--muted)]"],
  // emerald 文字/边框（暗主题里的涨色，白底对比度不足）→ success
  [/\btext-emerald-(200|300|400)(\/\d+)?\b/g, "text-[var(--success)]"],
  [/\bborder-emerald-(300|400|500)\/\d+\b/g, "border-[var(--success-border)]"],
  [/\bbg-emerald-500\/(10|12|14|15)\b/g, "bg-[var(--success-bg)]"],
  // sky / cyan 强调 → primary
  [/\btext-(sky|cyan)-(200|300)\b/g, "text-[var(--primary)]"],
  [/\bborder-(sky|cyan)-400\/\d+\b/g, "border-[var(--primary-border)]"],
  [/\bbg-(sky|cyan)-500\/(10|12)\b/g, "bg-[var(--primary-bg)]"],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

let changedFiles = 0;
let totalSubs = 0;
for (const file of walk(ROOT)) {
  const before = readFileSync(file, "utf8");
  let after = before;
  let fileSubs = 0;
  for (const [re, to] of RULES) {
    after = after.replace(re, () => {
      fileSubs += 1;
      return to;
    });
  }
  if (after !== before) {
    writeFileSync(file, after);
    changedFiles += 1;
    totalSubs += fileSubs;
    console.log(`  ${fileSubs.toString().padStart(3)}  ${file.replace(ROOT, "app/daa")}`);
  }
}
console.log(`\n改动 ${changedFiles} 个文件，共 ${totalSubs} 处替换。`);
