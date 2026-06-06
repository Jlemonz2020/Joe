# Phase 036 Cleanup

## Cleaned

- 首页旧的 `module-grid` 三张内联状态卡已删除。
- 未保留临时 dev server。
- `server-stop-check.txt` 未发现 `4431` 或 `4432` 端口残留。
- `project-source/` 排除了 `node_modules`、`.astro`、`dist`。
- 无新增外链素材。
- 无站点部署残留。

## Kept Intentionally

- `verify-home-task-cards.mjs`：后续首页视觉回归可复用。
- `verify-route-matrix.sh`：静态路由冒烟脚本。
- `writing-guidelines-command.md`：本阶段文案审核依据。
- screenshots：阶段审核证据。

## Next Cleanup Target

Phase 037 结束时检查首页项目预览是否引入 mock 项目数据。若有临时 mock，必须删除。
