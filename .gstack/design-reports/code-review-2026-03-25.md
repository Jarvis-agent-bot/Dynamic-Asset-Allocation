# Code Review 修改建议 — DAA Console

**审查日期**：2026-03-25
**审查范围**：287 文件变更（main...HEAD），覆盖架构分层、安全性、性能、API 规范、数据完整性
**总体评分**：7.5/10
**安全风险等级**：中等

---

## 一、需要修改的文件列表

### P0 (必须修改)
- `app/api/daa/auth/bootstrap/route.ts`
- `src/daa/store/storeShared.ts`
- `src/daa/cron/auth.ts`

### P1 (建议修改)
- `app/api/daa/chat/telegram/webhook/route.ts`
- `src/daa/pg/daaPg.ts`
- `app/api/daa/cron/price-refresh/route.ts`
- `src/core/rebalanceCore.ts` + `src/core/backtestDriftRebalance.ts`
- `app/api/daa/auth/login/route.ts`
- `src/daa/config/secretsManager.ts`

### P2 (可选优化)
- `app/api/daa/read/trades/route.ts`
- `app/api/daa/hf/ingest/run/route.ts`
- `src/daa/api/routeHelpers.ts`
- 所有 POST/PUT/PATCH/DELETE 路由 (CSRF)

---

## 二、具体修改内容

### P0-1: Bootstrap 端点无身份验证
**文件**: `app/api/daa/auth/bootstrap/route.ts`
**问题**: POST 端点可被任意未认证用户调用创建管理员账号，且无禁用机制
**修复**: 添加 "仅在无账号时允许" 守卫

### P0-2: DDL 函数存在 SQL 标识符注入风险
**文件**: `src/daa/store/storeShared.ts` L111, L122
**问题**: `archiveTableToLegacy` 和 `ensureTableColumn` 使用字符串拼接构建 DDL
**修复**: 对表名/列名使用双引号转义

### P0-3: 非生产环境 Cron 认证完全跳过
**文件**: `src/daa/cron/auth.ts` L21
**问题**: NODE_ENV 非 production 时 cron 端点对任何人开放
**修复**: 仅在 DAA_PG_MEM=1 时跳过认证

### P1-1: Telegram Webhook 密钥比较非时序安全
**文件**: `app/api/daa/chat/telegram/webhook/route.ts` L19
**修复**: 使用 `timingSafeEqual`

### P1-2: 数据库连接池未配置大小和超时
**文件**: `src/daa/pg/daaPg.ts` L102
**修复**: 显式配置 max/idleTimeout/connectionTimeout

### P1-3: 价格刷新 N+1 查询
**文件**: `app/api/daa/cron/price-refresh/route.ts` L127-146
**修复**: 批量 UPDATE

### P1-4: Core 层违反纯度约定
**文件**: `src/core/rebalanceCore.ts` L117
**修复**: 将 `toFinite` 移至 `src/core/utils/`

### P1-5: 登录路由泄露内部错误详情
**文件**: `app/api/daa/auth/login/route.ts` L54-59
**修复**: 返回通用错误信息

### P1-6: 加密密钥回退使用硬编码默认值
**文件**: `src/daa/config/secretsManager.ts` L67-72
**修复**: 生产环境拒绝使用默认密钥

---

## 三、修改优先级

### P0（必须修改 — 安全关键）
- [ ] Bootstrap 端点添加身份验证守卫
- [ ] DDL 函数添加 SQL 标识符转义
- [ ] 收紧 Cron 认证（非生产环境不跳过）

### P1（建议修改 — 安全+性能）
- [ ] Telegram webhook 改用 timingSafeEqual
- [ ] 配置数据库连接池参数
- [ ] 价格刷新改为批量 UPDATE
- [ ] Core 层依赖路径修正
- [ ] 登录错误信息脱敏
- [ ] 加密密钥回退策略加固

### P2（可选优化）
- [ ] 添加 CSRF 保护
- [ ] HF 摄入端点改用 editor 权限
- [ ] 读取端点添加游标分页
- [ ] 添加登录速率限制

---

## 四、正面发现

| 维度 | 评价 |
|------|------|
| SQL 参数化 | ✅ 99% 使用 $1/$2 参数化查询 |
| LLM 注入防护 | ✅ sanitizeForPrompt() 过滤危险字符 |
| 开放重定向防护 | ✅ url.ts 严格路径校验 |
| 密钥存储 | ✅ AES-256-GCM + 随机 IV |
| 事务使用 | ✅ 多表操作使用事务 + ROLLBACK |
| 错误降级 | ✅ LLM 层所有失败返回结构化 fallback |
| 版本冲突检测 | ✅ 系统配置使用乐观锁 |
