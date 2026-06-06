# Phase 037 Audit

## Gate

`approved`

## Checklist

- [x] 首页项目预览接入 `/api/projects`
- [x] live 项目为空时显示赛蕾项目提示卡
- [x] 有项目时渲染任务档案卡
- [x] 首页最多展示 3 条项目
- [x] 生产源码不包含项目测试数据
- [x] 项目文本做 HTML 转义
- [x] 项目 href 做本地路径过滤
- [x] 移动端无横向溢出
- [x] reduced-motion 关闭状态灯动画
- [x] 构建、类型检查、审计通过
- [x] 源码和 dist 快照已归档

## Risks

- 当前线上项目列表为空，正式部署前需要继续保留空态路径。
- 后续若后台项目数据含远程封面图，本阶段组件暂不显示图片，应在项目页阶段单独处理图像规则。

## Push Evidence

- Main implementation commit: `f055bf8e88126a74d538aac534fd801a0b57a6b6`
- Remote main after implementation push: `f055bf8e88126a74d538aac534fd801a0b57a6b6 refs/heads/main`
- Push verification commit: `pending`
- Remote main after verification push: `pending`
