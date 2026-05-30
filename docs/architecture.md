# 架构说明

## 模块边界

`blog-redesign/` 是前台静态站点，页面通过 `assets/app.js` 请求后端 API 渲染文章、项目、瞬间、评论、点赞、搜索和 GitHub 贡献数据。前台只有展示和访客交互逻辑，不保存后台密钥。

`blog-backend/` 是运行在树莓派上的 Node.js 服务，监听 `127.0.0.1:8097`。它负责公开 API、后台登录、内容维护、上传文件、搜索同步、评论点赞和可视化编辑数据发布。

`blog-backend/admin-src/` 是后台管理端源码。构建命令会输出到 `blog-backend/public/admin/`，线上由后端在 `/admin` 下提供访问。

`ops/pi-sites.conf` 是 Nginx 配置参考。Nginx 负责 TLS、静态前台、上传文件和反向代理。

## 数据流

```text
前台页面
  -> /api/posts, /api/projects, /api/moments
  -> /api/comments, /api/reactions
  -> /api/search

后台管理端
  -> /admin/api/login
  -> /admin/api/uploads
  -> /admin/api/frontend-editor
  -> /admin/api/frontend-editor/draft
  -> /admin/api/frontend-editor/publish
  -> /admin/api/frontend-editor/restore
```

主要数据存储：

- MySQL：用户、分类、文章、项目、瞬间、评论、点赞、站点设置。
- Redis：可选缓存和运行时状态。
- Meilisearch：站内搜索索引。
- 文件系统：上传文件在 `/data/blog-backend/uploads`，备份在 `/data/blog-backend/backups`。

## 可视化编辑

前台元素通过 `data-edit-target`、`data-text-key`、`data-layout-key` 等属性暴露可编辑目标。后台预览页会带上 `?editor=1`，前台脚本只在这个模式下启用编辑桥接。

后台保存草稿不会直接影响正式页面；发布后才会写入前台配置或静态资源。恢复操作用于回到最近一次可用状态。

## 安全边界

- `.env`、`ADMIN-CREDENTIALS.txt`、上传文件和备份目录不进入 Git。
- `/admin` 在 Nginx 层限制为本机和内网访问。
- 后端只监听 `127.0.0.1`，公网入口统一走 Nginx。
- 构建产物可以重新生成，不作为主要维护对象。
