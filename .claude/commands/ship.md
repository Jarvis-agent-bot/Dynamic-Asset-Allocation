---
description: "快速提交 + 推送 + 部署到 VPS（跳过 PR）"
---

# 快速部署

适用于小改动或紧急修复，跳过 PR 流程直接推送并部署。

## 执行步骤

1. 运行 `source ~/.zshrc && pnpm typecheck` 确认类型检查通过
2. 运行 `source ~/.zshrc && pnpm test` 确认测试通过
3. 查看 `git status` 和 `git diff --stat`
4. 将相关文件 `git add` 并 `git commit`（commit message 用中文描述改动）
5. `git push origin main`
6. SSH 到 VPS 执行部署：
   ```bash
   ssh onekey-vps "cd /opt/Dynamic-Asset-Allocation && git pull origin main && docker compose build --no-cache daa-web && docker compose up -d daa-web"
   ```
7. 确认容器状态：
   ```bash
   ssh onekey-vps "docker ps --filter name=daa-web --format '{{.Names}} {{.Status}}'"
   ```

## 环境信息
- pnpm: `source ~/.zshrc` 后可用
- gh CLI: `/opt/homebrew/bin/gh`
- VPS Host: `onekey-vps`（1Password SSH agent）
- 项目路径: `/opt/Dynamic-Asset-Allocation`
