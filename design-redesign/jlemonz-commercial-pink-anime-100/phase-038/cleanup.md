# Phase 038 Cleanup

## Cleaned

- 未保留临时 dev server。
- `server-stop-check.txt` 未发现 `4451` 或 `4452` 端口残留。
- `project-source/` 排除了 `node_modules`、`.astro`、`dist`。
- 生产源码没有临时 moment fixture。
- 无新增外链素材。
- 无站点部署残留。

## Kept Intentionally

- `verify-home-moment-preview.mjs`：覆盖 live、fixture、empty、reduced-motion 和图片加载。
- `verify-route-matrix.sh`：静态路由冒烟脚本。
- `live-moments.json`：本阶段 API 基线。
- `live-moment-image.webp`：本阶段图片验证资产。
- screenshots：阶段审核证据。

## Next Cleanup Target

Phase 039 结束时检查分类入口是否留下临时分类或无意义“新分类”。
