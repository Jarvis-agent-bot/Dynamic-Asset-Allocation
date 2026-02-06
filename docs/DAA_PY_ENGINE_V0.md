# DAA Python Engine (v0)

目标：提供一个在线 API（FastAPI）作为 DAA 的“再平衡/执行建议引擎”。

## Endpoints

- `GET /health`
- `POST /v1/rebalance/simulate`
  - 输入：money_plan + signals
  - 输出：suggested orders + explain + warnings

## Nginx

建议通过 VPS nginx 将 Python API 暴露为：
- `https://exwxyzi.cn/daa-api/` → `daa-py` service（宿主机 127.0.0.1:8001 → container 8000）

避免和 Next.js 的 `/daa/` 前缀冲突。

## Notes

- v0 仅做极简 heuristic（为产品闭环搭骨架），不做全局最优化。
- v1 可替换内部实现为 vectorbt/backtrader 等，而 API contract 保持稳定。
