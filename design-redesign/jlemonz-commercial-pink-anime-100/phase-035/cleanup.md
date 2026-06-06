# Phase 035 Cleanup

## Cleaned

- 未保留临时 dev server。
- `server-stop-check.txt` 未发现 `4421` 或 `4422` 端口残留。
- `project-source/` 排除了 `node_modules`、`.astro`、`dist`。
- 无新增外链素材。
- 无站点部署残留。

## Kept Intentionally

- `verify-github-sync.mjs`：后续阶段可复用的视觉回归脚本。
- `verify-route-matrix.sh`：后续阶段可复用的静态路由冒烟脚本。
- `live-github-contributions.json`：本阶段数据契约快照。
- screenshots：阶段审核证据。

## Next Cleanup Target

Phase 036 结束时应清除三张任务卡实验样式，只保留最终被 BaseLayout 和首页引用的组件/样式。
