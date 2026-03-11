#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const OUT_DIR = __dirname.replace(/playwright-src$/, 'playwright');

function absolutePath(name) {
  return path.join(OUT_DIR, name);
}

async function readJsonAtPathOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readJsonOrNull(fileName) {
  return readJsonAtPathOrNull(absolutePath(fileName));
}

function formatBug(bug) {
  const lines = [];
  lines.push(`- 标题：${bug.title}`);
  lines.push(`  - 严重级别：${bug.severity}`);
  lines.push(`  - 前置条件：${bug.preconditions || '无'}`);
  lines.push(`  - 复现步骤：${(bug.steps || []).join(' -> ') || '无'}`);
  lines.push(`  - 实际结果：${bug.actual || '无'}`);
  lines.push(`  - 期望结果：${bug.expected || '无'}`);
  lines.push(`  - 证据路径：${(bug.evidence || []).join(' , ') || '无'}`);
  return lines.join('\n');
}

async function loadSceneDetails(summary) {
  const out = [];
  for (const scene of Array.isArray(summary?.scenes) ? summary.scenes : []) {
    const jsonPath = scene?.jsonPath;
    if (!jsonPath) continue;
    const data = await readJsonAtPathOrNull(jsonPath);
    if (data) out.push(data);
  }
  return out;
}

function pushSuiteSummary(lines, title, summary, opts = {}) {
  lines.push(`## ${title}`);
  if (!summary) {
    lines.push('- 状态：未生成');
    lines.push('');
    return;
  }
  lines.push(`- 命令：\`${summary.command || 'unknown'}\``);
  lines.push(`- 状态：${summary.status || 'unknown'}`);
  lines.push(`- 退出码：${summary.exitCode ?? 'unknown'}`);
  if (summary.logPath) lines.push(`- 日志：${summary.logPath}`);
  if (Array.isArray(summary.includedSpecs) && summary.includedSpecs.length > 0) {
    lines.push(`- 覆盖文件：${summary.includedSpecs.join(' , ')}`);
  }
  if (Array.isArray(summary.includedTests) && summary.includedTests.length > 0) {
    lines.push(`- 覆盖测试：${summary.includedTests.join(' , ')}`);
  }
  if (opts.includeKnownFailure) {
    lines.push(`- 已知失败是否保留：${summary.knownFailureRetained ? '是' : '否'}`);
    lines.push(`- 已知失败定位：${summary.knownFailurePath || '无'}`);
  }
  if (summary.notes) lines.push(`- 说明：${summary.notes}`);
  lines.push('');
}

function pushSceneSummary(lines, title, summary) {
  lines.push(`## ${title}`);
  if (!summary) {
    lines.push('- 状态：未生成');
    lines.push('');
    return;
  }
  lines.push(`- Base URL：${summary.baseUrl || 'unknown'}`);
  lines.push(`- 场景数：${summary.sceneCount ?? 0}`);
  lines.push(`- 失败场景：${(summary.failedScenes || []).join(', ') || '无'}`);
  lines.push(`- 警告场景：${(summary.warningScenes || []).join(', ') || '无'}`);
  lines.push(`- Bug 数量：${summary.bugCount ?? 0}`);
  if (summary.fatalError) lines.push(`- 致命错误：${summary.fatalError}`);
  lines.push('');
}

function pushSceneDetails(lines, sectionTitle, details) {
  lines.push(`### ${sectionTitle}`);
  if (!details.length) {
    lines.push('- 无场景明细');
    lines.push('');
    return;
  }
  for (const scene of details) {
    lines.push(`#### ${scene.scene}`);
    lines.push(`- 状态：${scene.status}`);
    lines.push(`- 摘要：${scene.summary || '无'}`);
    lines.push(`- 当前 URL：${scene.currentUrl || '无'}`);
    lines.push(`- Screenshot：${scene.screenshotPath || '无'}`);
    lines.push(`- JSON：${scene.jsonPath || '无'}`);
    lines.push(`- HTML：${scene.htmlPath || '无'}`);
    lines.push(`- Console/PageError：${(scene.consoleErrors || []).length}/${(scene.pageErrors || []).length}`);
    lines.push(`- RequestFailure/4xx5xx：${(scene.requestFailures || []).length}/${(scene.badResponses || []).length}`);
    if ((scene.bugs || []).length > 0) {
      lines.push('- 发现的问题：');
      for (const bug of scene.bugs) lines.push(formatBug(bug));
    } else {
      lines.push('- 发现的问题：无');
    }
    if ((scene.noise || []).length > 0) {
      const sample = scene.noise[0].url || scene.noise[0].errorText || '见 JSON';
      lines.push(`- 外部噪声：${scene.noise.length} 条（示例：${sample}）`);
    }
    lines.push('');
  }
}

async function main() {
  const baseline = await readJsonOrNull('baseline-summary.json');
  const deepE2E = await readJsonOrNull('deep-e2e-summary.json');
  const routeSummary = await readJsonOrNull('route-summary.json');
  const manual = await readJsonOrNull('manual-summary.json');
  const integration = await readJsonOrNull('integration-summary.json');

  const manualDetails = await loadSceneDetails(manual);
  const integrationDetails = await loadSceneDetails(integration);
  const allSceneDetails = manualDetails.concat(integrationDetails);

  const lines = [];
  lines.push('# DAA Playwright 巡检报告');
  lines.push('');

  pushSuiteSummary(lines, '基线回归结果', baseline, { includeKnownFailure: true });
  pushSuiteSummary(lines, '新增 E2E 深测', deepE2E);
  pushSuiteSummary(lines, 'Cron / Bootstrap 路由深测', routeSummary);
  pushSceneSummary(lines, '一次性巡检结果', manual);
  pushSceneSummary(lines, '少 mock / 真后端回归结果', integration);

  lines.push('## 场景明细');
  pushSceneDetails(lines, '一次性巡检', manualDetails);
  pushSceneDetails(lines, '少 mock / 真后端回归', integrationDetails);

  lines.push('## 汇总缺陷清单');
  const allBugs = allSceneDetails.flatMap((scene) => scene.bugs || []);
  if (allBugs.length <= 0) {
    lines.push('- 无');
  } else {
    for (const bug of allBugs) lines.push(formatBug(bug));
  }
  lines.push('');

  lines.push('## 证据索引');
  for (const scene of allSceneDetails) {
    lines.push(`- ${scene.scene}：${[scene.screenshotPath, scene.jsonPath, scene.htmlPath].filter(Boolean).join(' , ')}`);
  }
  if (baseline?.logPath) lines.push(`- baseline：${baseline.logPath}`);
  if (deepE2E?.logPath) lines.push(`- deep-e2e：${deepE2E.logPath}`);
  if (routeSummary?.logPath) lines.push(`- route-tests：${routeSummary.logPath}`);

  await fs.writeFile(absolutePath('daa-audit-report.md'), `${lines.join('\n')}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
