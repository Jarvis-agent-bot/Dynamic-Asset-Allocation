#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE_URL = String(process.env.DAA_AUDIT_BASE_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
const OUT_DIR = __dirname.replace(/playwright-src$/, 'playwright');
const USERNAME = 'admin';
const PASSWORD = 'admin123';
const VIEWPORT = { width: 1440, height: 900 };
const STEP_TIMEOUT_MS = 20000;
const NOISE_PATTERNS = [
  /fonts\.gstatic\.com/i,
  /fonts\.googleapis\.com/i,
];

function absolutePath(name) {
  return path.join(OUT_DIR, name);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeError(error) {
  if (!error) return 'unknown error';
  if (error instanceof Error) return error.stack || error.message || String(error);
  return String(error);
}

function trimMessage(value, max = 600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function isNoiseUrl(url) {
  return NOISE_PATTERNS.some((pattern) => pattern.test(String(url || '')));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function shortSettled(page, waitMs = 700) {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(waitMs);
}

async function gotoPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await shortSettled(page);
}

async function expectVisible(locator, timeout = STEP_TIMEOUT_MS) {
  await locator.first().waitFor({ state: 'visible', timeout });
}

async function waitForBodyMatch(page, matchers, timeout = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    for (const matcher of matchers) {
      if (typeof matcher === 'string' ? bodyText.includes(matcher) : matcher.test(bodyText)) {
        return bodyText;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`未在 ${timeout}ms 内命中页面文案：${matchers.map((item) => String(item)).join(' | ')}`);
}

function createBug(input) {
  return {
    title: input.title,
    severity: input.severity || 'P2',
    preconditions: input.preconditions || '',
    steps: Array.isArray(input.steps) ? input.steps : [],
    actual: input.actual || '',
    expected: input.expected || '',
    evidence: [],
  };
}

function attachMonitors(page, result) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    result.consoleErrors.push({
      type: msg.type(),
      text: trimMessage(msg.text(), 800),
      location: msg.location(),
    });
  });

  page.on('pageerror', (error) => {
    result.pageErrors.push({ message: trimMessage(normalizeError(error), 1200) });
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const entry = {
      method: request.method(),
      url,
      errorText: trimMessage(request.failure()?.errorText || 'request_failed', 300),
    };
    if (isNoiseUrl(url)) result.noise.push({ type: 'requestfailed', ...entry });
    else result.requestFailures.push(entry);
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    const entry = { status, url, method: response.request().method() };
    if (isNoiseUrl(url)) result.noise.push({ type: 'response', ...entry });
    else result.badResponses.push(entry);
  });
}

async function fillLogin(page) {
  await expectVisible(page.getByLabel('用户名'));
  await page.getByLabel('用户名').fill(USERNAME);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: /登录系统/ }).click();
}

async function resolveLoginFlow(page, returnTo = '/daa/dashboard') {
  await gotoPage(page, `${BASE_URL}/daa/login?returnTo=${encodeURIComponent(returnTo)}`);
  const usernameInput = page.getByLabel('用户名').first();
  const homeButton = page.getByRole('button', { name: /进入资产首页/ }).first();
  const deadline = Date.now() + STEP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const currentPath = new URL(page.url()).pathname;
    if (currentPath.startsWith('/daa/dashboard')) {
      await shortSettled(page, 900);
      return currentPath;
    }

    if (await homeButton.isVisible().catch(() => false)) {
      await homeButton.click();
      await page.waitForURL((url) => url.pathname.startsWith('/daa/dashboard'), { timeout: 20000 });
      await shortSettled(page, 900);
      return new URL(page.url()).pathname;
    }

    if (await usernameInput.isVisible().catch(() => false)) {
      await fillLogin(page);
      await page.waitForURL((url) => url.pathname.startsWith('/daa/dashboard'), { timeout: 20000 });
      await shortSettled(page, 900);
      return new URL(page.url()).pathname;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`登录入口在 ${returnTo} 未进入可操作状态，当前 URL=${page.url()}`);
}

async function loginTo(page, returnTo = '/daa/dashboard') {
  const currentPath = await resolveLoginFlow(page, returnTo);
  if (currentPath !== returnTo) {
    await gotoPage(page, `${BASE_URL}${returnTo}`);
  }
}

async function step(ctx, label, fn, options = {}) {
  try {
    await fn();
    ctx.result.assertions.push({ label, status: 'passed' });
    return { ok: true };
  } catch (error) {
    const message = trimMessage(normalizeError(error), 1600);
    ctx.result.assertions.push({ label, status: 'failed', message });
    ctx.result.bugs.push(createBug({
      title: options.title || `${ctx.result.scene}：${label}失败`,
      severity: options.severity || 'P2',
      preconditions: options.preconditions || `${ctx.result.scene} 场景已启动`,
      steps: options.steps || [label],
      actual: options.actual || message,
      expected: options.expected || `${label} 应成功完成`,
    }));
    ctx.result.status = 'failed';
    if (options.critical) throw error;
    return { ok: false, error };
  }
}

async function getCurrentSceneHtml(page) {
  try {
    return await page.content();
  } catch {
    return '<html><body>unable to capture page html</body></html>';
  }
}

async function finalizeScene(result, page, context) {
  result.currentUrl = page.url();
  result.screenshotPath = absolutePath(`${result.scene}.png`);
  result.jsonPath = absolutePath(`${result.scene}.json`);

  try {
    await page.screenshot({ path: result.screenshotPath, fullPage: true });
  } catch (error) {
    result.screenshotError = trimMessage(normalizeError(error), 600);
  }

  if (result.status === 'failed') {
    result.htmlPath = absolutePath(`${result.scene}.html`);
    try {
      await fs.writeFile(result.htmlPath, await getCurrentSceneHtml(page), 'utf8');
    } catch (error) {
      result.htmlCaptureError = trimMessage(normalizeError(error), 600);
    }
  }

  if (result.status === 'passed' && (result.bugs.length > 0 || result.pageErrors.length > 0 || result.consoleErrors.length > 0 || result.requestFailures.length > 0)) {
    result.status = 'warning';
  }

  const evidence = [result.screenshotPath, result.jsonPath].concat(result.htmlPath ? [result.htmlPath] : []);
  result.bugs = result.bugs.map((bug) => ({ ...bug, evidence }));
  result.endedAt = nowIso();
  await writeJson(result.jsonPath, result);
  await context.close();
}

async function getTargetAssetKeys(page, limit = 3) {
  const locator = page.locator('input[data-testid^="workbench-target-"]');
  await expectVisible(locator.first());
  const count = Math.min(await locator.count(), limit);
  const keys = [];
  for (let index = 0; index < count; index += 1) {
    const testId = await locator.nth(index).evaluate((el) => el.getAttribute('data-testid') || '');
    if (!testId.startsWith('workbench-target-')) throw new Error(`无法解析目标权重 test id: ${testId}`);
    keys.push(testId.replace('workbench-target-', ''));
  }
  return keys;
}

async function getFirstTargetAssetKey(page) {
  const keys = await getTargetAssetKeys(page, 1);
  return keys[0] || '';
}

async function ensureWatchlistAssets(page, minAssets = 2) {
  await page.getByRole('button', { name: /^资产发现/ }).first().click();
  await page.waitForTimeout(1200);

  const addButtons = page.locator('[data-testid^="featured-asset-add-"]');
  const addCount = await addButtons.count();
  if (addCount <= 0) {
    const bodyText = trimMessage(await page.locator('body').innerText().catch(() => ''), 800);
    throw new Error(`资产发现未返回可加入资产：${bodyText}`);
  }

  let joined = 0;
  for (let index = 0; index < addCount && joined < minAssets; index += 1) {
    const button = addButtons.nth(index);
    await expectVisible(button);
    const beforeText = trimMessage(await button.innerText().catch(() => ''), 80);
    if (/已加入/.test(beforeText)) {
      joined += 1;
      continue;
    }
    await button.click();
    await page.waitForTimeout(1000);
    const afterText = trimMessage(await button.innerText().catch(() => ''), 80);
    if (!/已加入/.test(afterText)) {
      throw new Error(`第 ${index + 1} 个推荐资产加入后按钮仍为：${afterText || 'empty'}`);
    }
    joined += 1;
  }

  await page.getByRole('button', { name: /^观察列表/ }).first().click();
  await page.waitForTimeout(1200);
  const targetLocator = page.locator('input[data-testid^="workbench-target-"]');
  await expectVisible(targetLocator.first());
  const targetCount = await targetLocator.count();
  if (targetCount < minAssets) {
    throw new Error(`观察列表只有 ${targetCount} 个可编辑资产，少于期望的 ${minAssets} 个`);
  }
  return targetCount;
}

async function ensureStrategyLabRunnable(page) {
  const runButton = page.getByTestId('strategy-lab-run-button').first();
  await expectVisible(runButton);
  if (!(await runButton.isDisabled().catch(() => true))) return;

  const bodyText = trimMessage(await page.locator('body').innerText().catch(() => ''), 1200);
  if (!/当前没有可研究资产|补充待研究资产 0 个|去资产发现|去观察列表/.test(bodyText)) {
    throw new Error(`运行按钮禁用且页面未给出明确可操作提示：${bodyText}`);
  }

  await gotoPage(page, `${BASE_URL}/daa/dashboard/workbench?tab=discovery`);
  await ensureWatchlistAssets(page, 1);
  const assetKey = await getFirstTargetAssetKey(page);
  const input = page.getByTestId(`workbench-target-${assetKey}`).first();
  await expectVisible(input);
  const currentValue = Number(await input.inputValue().catch(() => '0'));
  if (!(currentValue > 0)) {
    await input.fill('5');
    await page.getByTestId(`workbench-target-save-${assetKey}`).first().click();
    await waitForBodyMatch(page, [/目标权重已更新为/, /已归一化/, /设置已更新/], 15000);
  }

  await gotoPage(page, `${BASE_URL}/daa/dashboard/strategy-lab`);
  await expectVisible(page.getByTestId('strategy-lab-run-button').first());
  await shortSettled(page, 1200);
}

async function runWorkbenchLiveScene(ctx) {
  const { page, result } = ctx;
  const details = result.details;
  let assetKey = '';
  let assetKeys = [];
  let insightOutcome = 'not_run';
  let rebalanceOutcome = 'not_run';
  let manualOrderOutcome = 'not_run';

  await step(ctx, '进入工作台真实后端页面', async () => {
    await loginTo(page, '/daa/dashboard/workbench?tab=watchlist');
    await expectVisible(page.getByRole('heading', { name: '工作台' }));
    await expectVisible(page.getByRole('button', { name: /^观察列表/ }));
  }, {
    critical: true,
    severity: 'P1',
    expected: '工作台在真实后端下应可正常打开',
  });

  await step(ctx, '真实后端下可从资产发现补齐多资产观察列表', async () => {
    details.watchlistCount = await ensureWatchlistAssets(page, 2);
    assetKeys = await getTargetAssetKeys(page, 3);
    assetKey = assetKeys[0] || '';
    if (!assetKey) throw new Error('补齐观察列表后仍未找到首个资产');
    details.assetKeys = assetKeys;
  }, {
    critical: true,
    severity: 'P1',
    expected: '真实后端下资产发现应返回可加入资产，且观察列表至少出现 2 条可编辑资产',
    steps: ['进入工作台', '切到资产发现', '加入至少两个推荐资产', '返回观察列表'],
  });

  await step(ctx, '观察列表存在可编辑资产并可保存目标权重', async () => {
    const input = page.getByTestId(`workbench-target-${assetKey}`).first();
    await expectVisible(input);
    const original = Number(await input.inputValue().catch(() => '0'));
    const nextValue = original >= 99 ? Math.max(1, original - 1) : Math.max(5, original + 1);
    await input.fill(String(nextValue));
    await page.getByTestId(`workbench-target-save-${assetKey}`).first().click();
    await waitForBodyMatch(page, [/目标权重已更新为/, /已归一化/, /设置已更新/], 15000);
    details.assetKey = assetKey;
    details.targetWeightSavedTo = nextValue;
  }, {
    critical: true,
    severity: 'P1',
    expected: '真实后端下目标权重保存应成功',
    steps: ['登录工作台', '进入观察列表', '修改第一条目标权重', '点击保存'],
  });

  await step(ctx, '资产洞察在真实后端下可展开并切换页签', async () => {
    await page.getByRole('button', { name: '更多' }).first().click();
    await page.getByText(/展开详情|收起详情/).first().click();
    await expectVisible(page.getByRole('tab', { name: 'AI 解读' }));
    await page.getByRole('tab', { name: 'AI 解读' }).first().click();
    const bodyText = await waitForBodyMatch(page, [/暂无 AI 解读/, /分析模型/, /洞察加载失败/, /请反馈本次 AI 解读质量/], 15000);
    if (/洞察加载失败/.test(bodyText)) {
      throw new Error(trimMessage(bodyText, 800));
    }
    insightOutcome = /暂无 AI 解读/.test(bodyText) ? 'empty' : 'loaded';
  }, {
    severity: 'P2',
    expected: '真实后端下资产洞察应至少能打开；若洞察失败，应在审计中记录集成问题',
    steps: ['进入观察列表', '打开资产更多菜单', '展开详情', '切到 AI 解读'],
  });

  await step(ctx, '真实后端下手动市价单至少能生成预览', async () => {
    const buyButton = page.getByTestId(`workbench-buy-${assetKey}`).first();
    await expectVisible(buyButton);
    await buyButton.click();
    await expectVisible(page.getByText(/市价买入|市价卖出/).first());
    await page.getByPlaceholder('例如 1000').fill('100');
    await page.getByRole('button', { name: '生成预览' }).first().click();
    await page.waitForTimeout(1500);

    if (await page.getByText('预览失败').count()) {
      throw new Error('手动市价单停留在预览失败状态');
    }

    await expectVisible(page.getByText('Preview Ledger').first());
    const confirmButton = page.getByRole('button', { name: '确认执行' }).first();
    if (await confirmButton.isDisabled().catch(() => true)) {
      manualOrderOutcome = 'preview_ok_blocked_by_risk';
      await expectVisible(page.getByText(/当前交易将被风控阻断|风险提示/).first());
    } else {
      manualOrderOutcome = 'preview_ok_ready_to_execute';
    }

    const closeButton = page.getByRole('button', { name: '取消' }).first();
    if (await closeButton.count()) {
      await closeButton.click().catch(() => null);
      await page.waitForTimeout(400);
    }
  }, {
    severity: 'P2',
    expected: '真实后端下手动市价单至少应能生成预览；若被风控阻断，也应给出明确提示',
    steps: ['在观察列表点击买入', '输入下单金额', '点击生成预览'],
  });

  await step(ctx, '真实后端下可生成再平衡建议并给出可执行结果', async () => {
    await page.getByRole('button', { name: /^再平衡/ }).first().click();
    await page.getByRole('button', { name: '生成/刷新建议' }).first().click();
    await page.waitForTimeout(2500);

    const bodyText = await page.locator('body').innerText();
    if (/工作台加载失败|白屏|Unhandled Runtime Error/i.test(bodyText)) {
      throw new Error(trimMessage(bodyText, 900));
    }

    if (/尚无再平衡周期|当前周期没有生成建议|无需调仓|结果可信度偏低/.test(bodyText) && !/一键全选|执行选中|确认执行再平衡/.test(bodyText)) {
      rebalanceOutcome = 'generated_without_orders';
      return;
    }

    const executeButton = page.getByRole('button', { name: /执行选中/ }).first();
    if (await executeButton.isDisabled().catch(() => true)) {
      rebalanceOutcome = 'generated_but_disabled';
      return;
    }

    await executeButton.click();
    await expectVisible(page.getByText('确认执行再平衡'));
    const confirmButton = page.getByRole('button', { name: /确认执行|存在阻断，无法执行/ }).last();
    const confirmLabel = trimMessage(await confirmButton.innerText(), 80);
    if (/阻断/.test(confirmLabel) || await confirmButton.isDisabled()) {
      rebalanceOutcome = 'blocked_in_dialog';
      await page.getByRole('button', { name: '取消' }).last().click().catch(() => null);
      return;
    }

    await confirmButton.click();
    const afterText = await waitForBodyMatch(page, [/执行成功/, /部分执行成功/, /执行被风控阻断/, /执行失败/], 20000);
    if (/部分执行成功/.test(afterText)) rebalanceOutcome = 'partial';
    else if (/执行被风控阻断/.test(afterText)) rebalanceOutcome = 'blocked';
    else if (/执行失败/.test(afterText)) rebalanceOutcome = 'failed';
    else rebalanceOutcome = 'success';
  }, {
    severity: 'P1',
    expected: '真实后端下再平衡应能生成建议，并落到成功/部分成功/阻断/失败中的明确结果之一',
    steps: ['进入再平衡', '点击生成/刷新建议', '尝试执行选中'],
  });

  details.insightOutcome = insightOutcome;
  details.manualOrderOutcome = manualOrderOutcome;
  details.rebalanceOutcome = rebalanceOutcome;
  result.summary = `真实后端工作台回归完成；资产=${assetKeys.length || 0}，洞察=${insightOutcome}，手动单=${manualOrderOutcome}，再平衡=${rebalanceOutcome}。`;
}

async function runStrategyLabLiveScene(ctx) {
  const { page, result } = ctx;
  const details = result.details;
  let runOutcome = 'not_run';
  let writebackOutcome = 'not_attempted';

  await step(ctx, '进入策略实验室真实后端页面', async () => {
    await loginTo(page, '/daa/dashboard/strategy-lab');
    await expectVisible(page.getByRole('heading', { name: '策略实验室' }));
    await expectVisible(page.getByTestId('strategy-lab-run-button'));
  }, {
    critical: true,
    severity: 'P1',
    expected: '策略实验室在真实后端下应可正常打开',
  });

  await step(ctx, '折叠区在真实后端下可切换', async () => {
    for (const label of ['研究框架', '高级设置', '资产池与研究目标']) {
      const toggle = page.getByRole('button', { name: new RegExp(label) }).first();
      await expectVisible(toggle);
      await toggle.click();
      await page.waitForTimeout(300);
      await toggle.click();
      await page.waitForTimeout(300);
    }
  }, {
    severity: 'P3',
    expected: '策略实验室折叠区在真实后端下应可正常展开/收起',
  });

  await step(ctx, '真实后端下策略实验前可补齐最小研究资产', async () => {
    await ensureStrategyLabRunnable(page);
    const runButton = page.getByTestId('strategy-lab-run-button').first();
    if (await runButton.isDisabled().catch(() => true)) {
      const bodyText = trimMessage(await page.locator('body').innerText().catch(() => ''), 1200);
      throw new Error(`补齐资产后运行按钮仍禁用：${bodyText}`);
    }
  }, {
    critical: true,
    severity: 'P1',
    expected: '真实后端下策略实验室应可通过工作台真实数据补齐最小研究资产并恢复可运行状态',
    steps: ['进入策略实验室', '若按钮禁用则跳到工作台资产发现补齐资产', '返回策略实验室'],
  });

  await step(ctx, '真实后端下可完成一次策略实验运行', async () => {
    const runButton = page.getByTestId('strategy-lab-run-button').first();
    if (await runButton.isDisabled()) {
      throw new Error('运行按钮处于禁用状态');
    }
    await runButton.click();
    const bodyText = await waitForBodyMatch(page, [/运行总览/, /VALIDATION_FAILED/, /当前没有可研究资产/, /以下资产缺少币种字段/, /INTERNAL_ERROR/, /运行失败/], 45000);

    if (/运行总览/.test(bodyText)) {
      runOutcome = 'success';
      return;
    }
    if (/VALIDATION_FAILED|当前没有可研究资产|以下资产缺少币种字段/.test(bodyText)) {
      runOutcome = 'validation';
      return;
    }
    throw new Error(trimMessage(bodyText, 900));
  }, {
    critical: true,
    severity: 'P1',
    expected: '真实后端下策略实验室应成功出结果，或给出明确业务校验提示；不应出现集成错误',
    steps: ['进入策略实验室', '点击运行策略实验'],
  });

  await step(ctx, '运行成功后可尝试写回当前配置', async () => {
    if (runOutcome !== 'success') {
      writebackOutcome = 'skipped_without_success';
      return;
    }
    const writebackButton = page.getByTestId('strategy-lab-writeback-button').first();
    await expectVisible(writebackButton);
    if (await writebackButton.isDisabled()) {
      writebackOutcome = 'disabled';
      throw new Error('运行成功后写回按钮仍然禁用');
    }
    await writebackButton.click();
    const bodyText = await waitForBodyMatch(page, [/已将 .* 写回为当前目标/, /当前目标已与该候选一致，无需写回/, /当前结果已经不是这套实验配置的最新输出/, /写回失败/, /INTERNAL_ERROR/], 20000);
    if (/已将 .* 写回为当前目标/.test(bodyText)) writebackOutcome = 'success';
    else if (/当前目标已与该候选一致，无需写回/.test(bodyText)) writebackOutcome = 'noop';
    else if (/当前结果已经不是这套实验配置的最新输出/.test(bodyText)) writebackOutcome = 'stale';
    else throw new Error(trimMessage(bodyText, 900));
  }, {
    severity: 'P2',
    expected: '真实后端下写回应成功、无需写回或明确提示 stale；不应出现集成异常',
    steps: ['运行成功后点击写回目标权重'],
  });

  await step(ctx, '参数变化后会出现 stale 提示', async () => {
    if (runOutcome !== 'success') return;
    const benchmarkInput = page.locator('label').filter({ hasText: '基准' }).locator('input').first();
    await expectVisible(benchmarkInput);
    const current = trimMessage(await benchmarkInput.inputValue(), 16).toUpperCase();
    const nextValue = current === 'QQQ' ? 'SPY' : 'QQQ';
    await benchmarkInput.fill(nextValue);
    await page.waitForTimeout(500);
    await expectVisible(page.getByText('当前结果已不是这套输入的最新输出，请重新运行后再写回。'));
    details.changedBenchmarkTo = nextValue;
  }, {
    severity: 'P2',
    expected: '运行结果生成后，参数变化应触发 stale 提示，避免误写回',
    steps: ['运行成功', '修改基准输入'],
  });

  details.runOutcome = runOutcome;
  details.writebackOutcome = writebackOutcome;
  result.summary = `真实后端策略实验室回归完成；运行=${runOutcome}，写回=${writebackOutcome}。`;
}

async function runScene(name, handler) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT_MS);

  const result = {
    scene: name,
    status: 'passed',
    startedAt: nowIso(),
    endedAt: null,
    currentUrl: '',
    summary: '',
    assertions: [],
    bugs: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    badResponses: [],
    noise: [],
    details: {},
    screenshotPath: null,
    htmlPath: null,
    jsonPath: null,
  };

  attachMonitors(page, result);

  try {
    await handler({ page, context, result });
  } catch (error) {
    result.status = 'failed';
    result.error = trimMessage(normalizeError(error), 1800);
    if (!result.bugs.length) {
      result.bugs.push(createBug({
        title: `${name}：场景执行失败`,
        severity: 'P1',
        preconditions: `${name} 场景已启动`,
        steps: [`执行 ${name} 真实后端回归场景`],
        actual: result.error,
        expected: `${name} 场景应可完整执行`,
      }));
    }
  } finally {
    await finalizeScene(result, page, context);
    await browser.close();
  }

  return result;
}

async function main() {
  const startedAt = nowIso();
  const scenes = [
    ['workbench-live', runWorkbenchLiveScene],
    ['strategy-lab-live', runStrategyLabLiveScene],
  ];

  const results = [];
  for (const [name, handler] of scenes) {
    results.push(await runScene(name, handler));
  }

  const summary = {
    phase: 'live-regression',
    baseUrl: BASE_URL,
    startedAt,
    endedAt: nowIso(),
    sceneCount: results.length,
    failedScenes: results.filter((item) => item.status === 'failed').map((item) => item.scene),
    warningScenes: results.filter((item) => item.status === 'warning').map((item) => item.scene),
    bugCount: results.reduce((sum, item) => sum + item.bugs.length, 0),
    scenes: results.map((item) => ({
      scene: item.scene,
      status: item.status,
      summary: item.summary,
      screenshotPath: item.screenshotPath,
      jsonPath: item.jsonPath,
      htmlPath: item.htmlPath,
      bugCount: item.bugs.length,
      consoleErrorCount: item.consoleErrors.length,
      pageErrorCount: item.pageErrors.length,
      requestFailureCount: item.requestFailures.length,
      badResponseCount: item.badResponses.length,
    })),
  };

  await writeJson(absolutePath('integration-summary.json'), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(async (error) => {
  const message = normalizeError(error);
  await writeJson(absolutePath('integration-summary.json'), {
    phase: 'live-regression',
    baseUrl: BASE_URL,
    startedAt: nowIso(),
    endedAt: nowIso(),
    fatalError: trimMessage(message, 2000),
  }).catch(() => null);
  console.error(message);
  process.exitCode = 1;
});
