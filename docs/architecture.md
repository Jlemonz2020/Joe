# 架构说明

## 请求流

浏览器请求前台静态页面，页面脚本再访问后端公开 API。Nginx 负责静态资源、缓存头和反向代理；Node 服务负责内容读取、站点配置、后台鉴权、第三方数据快照和数据库写入。

## 后端模块

- `src/server.js`：HTTP 路由、公开接口、管理接口、内容格式化和启动初始化。
- `src/config.js`：从环境变量读取运行配置。
- `src/db.js`：MySQL 连接池和参数化查询。
- `src/redis.js`：轻量 Redis 缓存封装，缓存不可用时不阻断公开页面。
- `src/auth.js`：管理员密码校验和会话签名。
- `src/markdown.js`：Markdown 转 HTML 和纯文本提取。
- `src/search.js`：可选的 Meilisearch 同步和站内搜索。

题库、文章、瞬间、项目和站点装修数据都存储在服务器数据库；前端不保存生产内容副本。

## 前端模块

`blog-redesign/` 是无构建依赖的多页面前台。每个页面共享 `assets/app.js` 和 `assets/style.css`，页面加载后从 `/api/site/texts`、内容接口以及缓存快照接口获取最新展示数据。

`blog-backend/admin-src/` 是独立的 Vue 管理端源码。构建后输出到后端的 `public/admin/`，不把构建依赖和生产构建文件放入代码仓库。
