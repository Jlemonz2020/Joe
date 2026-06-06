# Phase 037 Cleanup

## Cleaned

- 未保留临时 dev server。
- `server-stop-check.txt` 未发现 `4441` 或 `4442` 端口残留。
- `project-source/` 排除了 `node_modules`、`.astro`、`dist`。
- 生产源码没有项目测试数据。
- 无新增外链素材。
- 无站点部署残留。

## Kept Intentionally

- `verify-home-project-preview.mjs`：覆盖 empty 和 ready 两种项目状态。
- `verify-route-matrix.sh`：静态路由冒烟脚本。
- `live-projects.json`：本阶段 API 基线。
- screenshots：阶段审核证据。

## Next Cleanup Target

Phase 038 结束时检查最近瞬间是否留下测试图片或临时动态数据。生产源码不得包含临时 moment fixture。
