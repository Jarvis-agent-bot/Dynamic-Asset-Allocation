#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE_URL = String(process.env.DAA_AUDIT_BASE_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
const OUT_DIR = __dirname.replace(/playwright-src$/, 'playwright');
const USERNAME = 'admin';
const PASSWORD = 'admin123';
const VIEWPORT = { width: 1440, height: 900 };
const STEP_TIMEOUT_MS = 15000;
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

function trimMessage(value, max = 500) {
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

async function shortSettled(page, waitMs = 600) {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(waitMs);
}

async function gotoPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await shortSettled(page);
}

async function expectVisible(locator, timeout = STEP_TIMEOUT_MS) {
  await locator.first().waitFor({ state: 'visible', timeout });
}

async function waitForText(page, text, timeout = STEP_TIMEOUT_MS) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
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
      text: trimMessage(msg.text(), 600),
      location: msg.location(),
    });
  });

  page.on('pageerror', (error) => {
    result.pageErrors.push({ message: trimMessage(normalizeError(error), 1000) });
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const entry = {
      method: request.method(),
      url,
      errorText: trimMessage(request.failure()?.errorText || 'request_failed', 300),
    };
    const ignorableAbort = entry.errorText === 'net::ERR_ABORTED' && (/market-indicators\/refresh/i.test(url) || /auth\/logout/i.test(url));
    if (ignorableAbort || isNoiseUrl(url)) result.noise.push({ type: 'requestfailed', ...entry });
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
    const message = trimMessage(normalizeError(error), 1200);
    ctx.result.assertions.push({ label, status: 'failed', message });
    ctx.result.bugs.push(createBug({
      title: options.title || `${ctx.result.scene}：${label}失败`,
      severity: options.severity || 'P2',
      preconditions: options.preconditions || `${ctx.result.scene} 场景已启动`,
      steps: options.steps || [label],
      actual: options.actual || message,
      expected: options.expected || `${label}应成功完成`,
    }));
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

async function openMoreMenu(page) {
  const trigger = page.getByRole('button', { name: /更多/ }).first();
  await expectVisible(trigger);
  await trigger.click();
  await page.getByText('低频操作').waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
}

async function getFirstTargetAssetKey(page) {
  const locator = page.locator('input[data-testid^="workbench-target-"]').first();
  await expectVisible(locator);
  const testId = await locator.evaluate((el) => el.getAttribute('data-testid') || '');
  if (!testId.startsWith('workbench-target-')) throw new Error(`无法解析目标权重 test id: ${testId}`);
  return testId.replace('workbench-target-', '');
}

async function runAuthScene(ctx) {
  const { page, result } = ctx;
  await step(ctx, '使用默认账号登录', async () => {
    await loginTo(page, '/daa/dashboard');
    if (page.url().includes('/daa/login')) throw new Error(`登录后仍停留在登录页：${page.url()}`);
  }, {
    critical: true,
    severity: 'P1',
    expected: '登录后应进入 /daa/dashboard 或其受保护子页面',
    steps: ['打开 /daa/login', '输入 admin / admin123', '点击“登录系统”'],
  });

  await step(ctx, '登录后主导航可见', async () => {
    await expectVisible(page.locator('nav[aria-label="DAA 主导航"]').first());
  }, { severity: 'P1', expected: '登录后应渲染主导航与系统壳层' });

  await step(ctx, '登录 returnTo 能正确落到工作台深链', async () => {
    const currentPath = await resolveLoginFlow(page, '/daa/dashboard/workbench');
    if (currentPath !== '/daa/dashboard/workbench') {
      throw new Error(`实际落点为 ${currentPath}`);
    }
    await waitForText(page, '持仓');
  }, {
    severity: 'P1',
    expected: '登录时携带 returnTo=/daa/dashboard/workbench 应直接进入工作台，而不是回总览页',
    steps: ['打开 /daa/login?returnTo=/daa/dashboard/workbench', '输入账号密码并登录'],
  });

  const deepLinks = [
    { path: '/daa/dashboard', marker: '组合总览' },
    { path: '/daa/dashboard/workbench', marker: '持仓' },
    { path: '/daa/dashboard/strategy-lab', marker: '策略实验室' },
    { path: '/daa/dashboard/trades', marker: '交易记录' },
    { path: '/daa/dashboard/settings', marker: '设置' },
  ];

  for (const item of deepLinks) {
    await step(ctx, `已登录态可访问 ${item.path}`, async () => {
      await gotoPage(page, `${BASE_URL}${item.path}`);
      if (page.url().includes('/daa/login')) throw new Error(`被重定向到登录页：${page.url()}`);
      await waitForText(page, item.marker);
    }, {
      severity: 'P1',
      expected: `${item.path} 应在已登录态下可访问`,
      steps: [`登录后访问 ${item.path}`],
    });
  }

  await step(ctx, '退出登录后访问深链会返回登录页', async () => {
    const profileButton = page.getByRole('button', { name: /admin/ }).first();
    await expectVisible(profileButton);
    await profileButton.click();
    await expectVisible(page.getByText('退出登录').last());
    await page.getByText('退出登录').last().click();
    await page.waitForURL((url) => url.pathname.startsWith('/daa/login'), { timeout: 15000 });
    await gotoPage(page, `${BASE_URL}/daa/dashboard/workbench`);
    await page.waitForTimeout(1200);
    if (!page.url().includes('/daa/login')) throw new Error(`退出后访问受保护链接未回登录页：${page.url()}`);
  }, {
    severity: 'P1',
    expected: '退出后再次访问受保护深链应跳回登录页',
    steps: ['登录成功', '点击右上角账户菜单', '选择“退出登录”', '访问 /daa/dashboard/workbench'],
  });

  result.summary = '完成登录、深链访问与退出登录验证。';
}

async function runOverviewScene(ctx) {
  const { page, result } = ctx;
  await step(ctx, '进入总览页', async () => {
    await loginTo(page, '/daa/dashboard');
    await waitForText(page, '组合总览');
  }, { critical: true, severity: 'P1', expected: '总览首页应可正常加载' });

  for (const panel of ['运行摘要', '市场温度', '关键提醒']) {
    await step(ctx, `总览面板可见：${panel}`, async () => {
      await waitForText(page, panel);
    }, { severity: 'P2', expected: `总览页应展示“${panel}”面板` });
  }

  const noteText = `playwright-audit-${Date.now()}`;

  await step(ctx, '现金流水空金额校验可见', async () => {
    await page.getByRole('button', { name: '入金' }).first().click();
    await waitForText(page, '记录入金');
    await page.getByRole('button', { name: '确认提交' }).click();
    await waitForText(page, '请输入大于 0 的金额', 10000);
  }, {
    severity: 'P2',
    expected: '现金流水弹窗在空金额提交时应给出明确校验提示',
    steps: ['进入总览页', '点击“入金”', '不填写金额直接提交'],
  });

  await step(ctx, '可提交一笔最小额入金并回写列表', async () => {
    const amountInput = page.getByPlaceholder(/请输入 .* 金额/).first();
    await expectVisible(amountInput);
    await amountInput.fill('100');
    await page.getByPlaceholder('例如：工资入账 / 提现').fill(noteText);
    await page.getByRole('button', { name: '确认提交' }).click();
    await waitForText(page, '入金已记录', 12000);
    await waitForText(page, noteText, 15000);
  }, {
    severity: 'P2',
    expected: '入金成功后应出现成功提示，并在现金流水中看到新备注',
    steps: ['打开入金弹窗', '填写金额 100 与唯一备注', '提交'],
  });

  result.summary = '完成总览页主要面板与现金流水入金验证。';
}

async function runWorkbenchScene(ctx) {
  const { page, result } = ctx;
  let assetKey = '';
  let previewOutcome = 'not_run';
  let rebalanceOutcome = 'not_run';

  await step(ctx, '进入工作台', async () => {
    await loginTo(page, '/daa/dashboard/workbench');
    await waitForText(page, '持仓');
  }, { critical: true, severity: 'P1', expected: '工作台首页应可正常加载' });

  for (const tabName of ['持仓', '观察列表', '资产发现', '再平衡']) {
    await step(ctx, `切换工作台 Tab：${tabName}`, async () => {
      await page.getByRole('button', { name: new RegExp(`^${tabName}`) }).first().click();
      await page.waitForTimeout(500);
    }, { severity: 'P2', expected: `${tabName} tab 应可点击切换` });
  }

  await step(ctx, '从推荐池加入一个资产到观察列表', async () => {
    await page.getByRole('button', { name: /^资产发现/ }).first().click();
    await page.waitForTimeout(800);
    const addButton = page.locator('[data-testid^="featured-asset-add-"]').filter({ hasText: /加入|已加入/ }).first();
    await expectVisible(addButton);
    const beforeText = trimMessage(await addButton.innerText(), 100);
    if (!/已加入/.test(beforeText)) {
      await addButton.click();
      await page.waitForTimeout(1200);
    }
    const afterText = trimMessage(await addButton.innerText(), 100);
    if (!/已加入/.test(afterText)) throw new Error(`加入按钮未变为已加入，当前文本：${afterText}`);
  }, {
    severity: 'P2',
    expected: '推荐池资产应可加入观察列表并切换为“已加入”',
    steps: ['进入工作台资产发现', '点击一个推荐资产的加入按钮'],
  });

  await step(ctx, '观察列表中存在可编辑资产', async () => {
    await page.getByRole('button', { name: /^观察列表/ }).first().click();
    await page.waitForTimeout(1200);
    assetKey = await getFirstTargetAssetKey(page);
    if (!assetKey) throw new Error('未找到可编辑资产');
  }, {
    critical: true,
    severity: 'P1',
    expected: '加入资产后观察列表中应出现目标权重输入框',
  });

  await step(ctx, '展开一条资产洞察并切换页签', async () => {
    await openMoreMenu(page);
    await page.getByText(/展开详情|收起详情/).first().click();
    await page.waitForTimeout(1200);
    const llmTab = page.getByRole('tab', { name: 'AI 解读' }).first();
    await expectVisible(llmTab);
    await llmTab.click();
    await page.waitForTimeout(800);
  }, {
    severity: 'P2',
    expected: '工作台应能展开资产洞察并切换页签',
    steps: ['进入观察列表', '打开某资产的更多菜单', '点击“展开详情”', '切换到 AI 解读页签'],
  });

  await step(ctx, '更新目标权重并保存', async () => {
    const input = page.getByTestId(`workbench-target-${assetKey}`);
    await expectVisible(input);
    await input.fill('5');
    await page.getByTestId(`workbench-target-save-${assetKey}`).click();
    await waitForText(page, '目标权重已更新为 5.00%', 12000);
  }, {
    severity: 'P2',
    expected: '保存目标权重后应出现成功提示',
    steps: ['在观察列表修改目标权重为 5', '点击保存'],
  });

  await step(ctx, '尝试手动市价单预览与执行', async () => {
    const buyButton = page.getByTestId(`workbench-buy-${assetKey}`);
    await expectVisible(buyButton);
    await buyButton.click();
    await waitForText(page, '市价买入');
    await page.getByPlaceholder('例如 1000').fill('100');
    await page.getByRole('button', { name: '生成预览' }).click();
    await page.waitForTimeout(1500);

    if (await page.getByText('预览失败').count()) {
      previewOutcome = 'preview_failed';
      throw new Error('手动单停留在预览失败状态');
    }

    await expectVisible(page.getByText('Preview Ledger').first());
    const confirmButton = page.getByRole('button', { name: '确认执行' }).first();
    if (await confirmButton.isDisabled()) {
      previewOutcome = 'preview_ok_blocked_by_risk';
      await expectVisible(page.getByText(/当前交易将被风控阻断|风险提示/).first());
    } else {
      await confirmButton.click();
      await page.waitForTimeout(2200);
      previewOutcome = 'executed_or_rejected';
    }

    const closeButton = page.getByRole('button', { name: '取消' }).first();
    if (await closeButton.count()) {
      await closeButton.click().catch(() => null);
      await page.waitForTimeout(500);
    }
  }, {
    severity: 'P2',
    expected: '手动市价单至少应能完成预览；若被风控阻断，也应有清晰阻断原因',
    steps: ['在观察列表点击买入', '按金额输入 100', '点击生成预览', '观察是否可执行或被风控阻断'],
    actual: '手动市价单链路未能完成预览或执行',
  });

  await step(ctx, '生成一次再平衡建议并尝试打开执行弹窗', async () => {
    await page.getByRole('button', { name: /^再平衡/ }).first().click();
    await page.waitForTimeout(900);
    const refreshButton = page.getByRole('button', { name: '生成/刷新建议' }).first();
    await expectVisible(refreshButton);

    const [generateResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/daa/workbench/rebalance/generate') && response.request().method() === 'POST', { timeout: 20000 }),
      refreshButton.click(),
    ]);
    const payload = await generateResponse.json().catch(() => null);
    const generated = payload && payload.ok !== false ? payload.data : null;
    result.details.rebalanceGenerate = {
      status: generateResponse.status(),
      created: Boolean(generated?.created),
      message: generated?.message || null,
      portfolioStatus: generated?.portfolioStatus || null,
    };

    if (!generateResponse.ok()) {
      rebalanceOutcome = 'generate_request_failed';
      throw new Error(`生成建议接口返回 ${generateResponse.status()}`);
    }

    if (!generated) {
      rebalanceOutcome = 'generate_unknown';
      throw new Error('生成建议接口未返回可解析数据');
    }

    if (!generated.created) {
      rebalanceOutcome = `skipped:${generated.portfolioStatus || 'unknown'}`;
      if (!generated.message) {
        throw new Error('生成建议未创建周期，且未返回原因文案');
      }
      await page.waitForTimeout(1200);
      return;
    }

    const cycleReadyDeadline = Date.now() + 15000;
    while (Date.now() < cycleReadyDeadline) {
      if (!(await page.getByText('尚无再平衡周期').count())) break;
      await page.waitForTimeout(400);
    }
    if (await page.getByText('尚无再平衡周期').count()) {
      rebalanceOutcome = 'generate_ui_not_refreshed';
      throw new Error('生成建议接口已返回成功，但页面仍停留在“尚无再平衡周期”');
    }

    rebalanceOutcome = 'generated';
    const selectAllButton = page.getByRole('button', { name: '一键全选' }).first();
    if (await selectAllButton.isVisible().catch(() => false)) {
      await selectAllButton.click();
      await page.waitForTimeout(1200);
    }

    const executeButton = page.getByRole('button', { name: /执行选中/ }).first();
    await expectVisible(executeButton);
    if (!(await executeButton.isDisabled())) {
      await executeButton.click();
      await page.waitForTimeout(1200);
      if (await page.getByText('确认执行再平衡').count()) {
        rebalanceOutcome = 'dialog_opened';
        await page.getByRole('button', { name: '取消' }).first().click().catch(() => null);
      }
    }
  }, {
    severity: 'P2',
    expected: '再平衡页应能生成建议，并在满足条件时打开执行确认弹窗',
    steps: ['进入再平衡 tab', '点击“生成/刷新建议”'],
  });

  result.summary = `完成工作台巡检；手动单结果=${previewOutcome}，再平衡结果=${rebalanceOutcome}。`;
}

async function runStrategyLabScene(ctx) {
  const { page, result } = ctx;
  let runState = 'not_run';

  await step(ctx, '进入策略实验室', async () => {
    await loginTo(page, '/daa/dashboard/strategy-lab');
    await waitForText(page, '策略实验室');
    await expectVisible(page.getByTestId('strategy-lab-run-button'));
  }, { critical: true, severity: 'P1', expected: '策略实验室应可正常加载并展示运行按钮' });

  for (const sectionKeyword of ['研究框架', '高级设置', '资产池与研究目标']) {
    await step(ctx, `折叠区可切换：${sectionKeyword}`, async () => {
      const button = page.getByRole('button', { name: new RegExp(sectionKeyword) }).first();
      await expectVisible(button);
      await button.click();
      await page.waitForTimeout(500);
      await button.click();
      await page.waitForTimeout(500);
    }, { severity: 'P3', expected: `${sectionKeyword} 控件应可展开/收起` });
  }

  await step(ctx, '执行一次策略实验室运行', async () => {
    const runButton = page.getByTestId('strategy-lab-run-button');
    await expectVisible(runButton);
    if (await runButton.isDisabled()) throw new Error('运行按钮处于禁用状态');
    await runButton.click();

    const start = Date.now();
    while (Date.now() - start < 25000) {
      if (await page.getByText('运行总览').count()) {
        runState = 'success';
        await waitForText(page, '候选详情');
        await waitForText(page, '深度分析');
        const writebackButton = page.getByTestId('strategy-lab-writeback-button');
        if (!(await writebackButton.isDisabled())) {
          await writebackButton.click();
          await page.waitForTimeout(1800);
        }
        return;
      }
      if (await page.getByText(/校验失败|VALIDATION_FAILED|缺少币种字段/).count()) {
        runState = 'validation_error';
        return;
      }
      await page.waitForTimeout(1000);
    }

    runState = 'timeout';
    throw new Error(trimMessage(await page.locator('body').innerText(), 700));
  }, {
    severity: 'P2',
    expected: '策略实验室运行后应进入“运行总览 / 候选详情 / 深度分析”或给出明确校验错误',
    steps: ['进入策略实验室', '点击运行按钮'],
  });

  result.summary = `完成策略实验室巡检；运行结果=${runState}。`;
}

async function runTradesScene(ctx) {
  const { page, result } = ctx;
  await step(ctx, '进入交易记录页', async () => {
    await loginTo(page, '/daa/dashboard/trades');
    await waitForText(page, '交易记录');
  }, { critical: true, severity: 'P1', expected: '交易记录页应可正常加载' });

  for (const tabName of ['再平衡周期', '订单明细', '复盘报告']) {
    await step(ctx, `交易记录 tab 可切换：${tabName}`, async () => {
      const tab = page.getByRole('button', { name: new RegExp(tabName) }).first();
      await expectVisible(tab);
      await tab.click();
      await page.waitForTimeout(600);
    }, { severity: 'P2', expected: `${tabName} tab 应可点击切换` });
  }

  await step(ctx, '交易记录页展示数据或合理空状态', async () => {
    const bodyText = await page.locator('body').innerText();
    if (!/还没有再平衡周期|还没有订单记录|暂无复盘报告|周期|订单|复盘/.test(bodyText)) {
      throw new Error('页面既没有数据，也没有合理空状态文案');
    }
  }, { severity: 'P2', expected: '交易记录页应展示已有数据或明确空状态' });

  result.summary = '完成交易记录页 tab 与空状态/数据状态检查。';
}

async function runSettingsScene(ctx) {
  const { page, result } = ctx;
  await step(ctx, '进入设置页', async () => {
    await loginTo(page, '/daa/dashboard/settings');
    await waitForText(page, '设置');
    await waitForText(page, '配置版本');
  }, { critical: true, severity: 'P1', expected: '设置页应可正常加载并展示配置版本' });

  await step(ctx, '修改一个低风险字段并保存', async () => {
    const strategySection = page.locator('#settings-strategy');
    await expectVisible(strategySection);
    const firstNumberInput = strategySection.locator('input[type="number"]').first();
    await expectVisible(firstNumberInput);
    const original = await firstNumberInput.inputValue();
    const nextValue = original === '1' ? '2' : '1';
    await firstNumberInput.fill(nextValue);
    await page.waitForTimeout(500);
    const saveButton = page.getByRole('button', { name: /保存全部设置/ }).first();
    await expectVisible(saveButton);
    await saveButton.click();
    await waitForText(page, '设置已更新', 15000);
    await waitForText(page, '当前页面没有待保存的修改', 15000);
  }, {
    severity: 'P2',
    expected: '设置保存成功后应出现成功提示且脏状态消失',
    steps: ['进入设置页', '修改一个数字字段', '点击保存全部设置'],
  });

  await step(ctx, '刷新市场状态层后工作台仍可访问', async () => {
    const refreshButton = page.getByRole('button', { name: /刷新市场状态层/ }).first();
    await expectVisible(refreshButton);
    await refreshButton.click();
    await page.waitForTimeout(5000);
    if (await page.getByText(/市场状态层已刷新|刷新市场中/).count()) {
      await page.waitForTimeout(500);
    }
    await gotoPage(page, `${BASE_URL}/daa/dashboard/workbench`);
    await waitForText(page, '持仓');
  }, {
    severity: 'P2',
    expected: '刷新市场状态层后工作台不应崩溃或空白',
    steps: ['在设置页点击刷新市场状态层', '返回工作台'],
  });

  result.summary = '完成设置保存、市场状态层刷新与返回工作台验证。';
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
        steps: [`执行 ${name} 巡检场景`],
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
    ['auth', runAuthScene],
    ['overview', runOverviewScene],
    ['workbench', runWorkbenchScene],
    ['strategy-lab', runStrategyLabScene],
    ['trades', runTradesScene],
    ['settings', runSettingsScene],
  ];

  const results = [];
  for (const [name, handler] of scenes) results.push(await runScene(name, handler));

  const summary = {
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

  await writeJson(absolutePath('manual-summary.json'), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(async (error) => {
  const message = normalizeError(error);
  await writeJson(absolutePath('manual-summary.json'), {
    baseUrl: BASE_URL,
    startedAt: nowIso(),
    endedAt: nowIso(),
    fatalError: trimMessage(message, 2000),
  }).catch(() => null);
  console.error(message);
  process.exitCode = 1;
});
