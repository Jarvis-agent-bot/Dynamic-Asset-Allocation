---
description: "创建 PR → 合入 main → VPS 拉取代码 → 构建部署"
---

# DAA 部署流程

执行完整的 PR 创建、合并和 VPS 部署流程。使用前请确保：
1. 当前分支有未推送的改动（或在 main 分支有未提交的改动）
2. 1Password SSH agent 已解锁（用于 VPS 连接）

## 流程

### 第一步：检查状态
运行 `git status` 和 `git diff --stat` 确认改动范围。如果在 main 分支上有未提交改动，先创建功能分支。

### 第二步：创建功能分支（如果在 main 上）
如果当前在 main 分支且有改动：
```bash
git checkout -b fix/描述性分支名
git add 相关文件
git commit -m "提交信息"
```

### 第三步：推送并创建 PR
```bash
git push -u origin 分支名
/opt/homebrew/bin/gh pr create --title "PR标题" --body "$(cat <<'EOF'
## Summary
- 改动描述

## Test plan
- [x] pnpm typecheck 通过
- [x] pnpm test 通过

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 第四步：合并 PR
```bash
/opt/homebrew/bin/gh pr merge PR编号 --squash --delete-branch
```

### 第五步：VPS 部署
```bash
ssh onekey-vps "cd /opt/Dynamic-Asset-Allocation && git pull origin main && docker compose build --no-cache daa-web && docker compose up -d daa-web"
```

### 第六步：验证部署
```bash
ssh onekey-vps "docker ps --filter name=daa-web --format '{{.Names}} {{.Status}}'"
```

## 注意事项
- `pnpm` 路径：需要 `source ~/.zshrc` 后使用
- `gh` 路径：`/opt/homebrew/bin/gh`
- VPS SSH：通过 1Password agent（Host: onekey-vps）
- VPS 项目路径：`/opt/Dynamic-Asset-Allocation`
- Docker 服务名：`daa-web`（web 应用）、`postgres`（数据库）、`daa-cron`（定时任务）

## 快速部署（跳过 PR，直接推 main）
适用于紧急修复或小改动：
```bash
source ~/.zshrc
git add 相关文件
git commit -m "fix: 描述"
git push origin main
ssh onekey-vps "cd /opt/Dynamic-Asset-Allocation && git pull origin main && docker compose build --no-cache daa-web && docker compose up -d daa-web"
```
