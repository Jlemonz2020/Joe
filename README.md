# Joe

这是部署在树莓派上的个人网站项目，包含静态前台、Node.js 后端、Vue 后台管理端和 Nginx 部署配置。

## 项目结构

| 目录 | 用途 |
| --- | --- |
| `blog-redesign/` | 前台静态页面与资源，线上部署到 `/data/sites/blog/html`。 |
| `blog-backend/` | Node.js API、后台路由、数据库初始化脚本和 systemd 脚本，线上部署到 `/data/blog-backend`。 |
| `blog-backend/admin-src/` | Vue 3 + Vite + Element Plus 后台管理端源码。 |
| `blog-backend/public/admin/` | 后台构建输出目录，只保留 `.gitkeep`，构建产物不进 Git。 |
| `ops/pi-sites.conf` | 树莓派 Nginx 站点配置参考。 |
| `docs/` | 架构、部署和运维说明。 |

## 运行方式

线上拓扑：

```text
浏览器
  -> Nginx 8086 HTTPS
    -> /                    静态前台 blog-redesign
    -> /api/                Node 后端 127.0.0.1:8097
    -> /admin               Node 后端 + admin 静态资源
    -> /uploads/            /data/blog-backend/uploads
```

后端依赖 MySQL、Redis 和 Meilisearch。本仓库不提交 `.env`、后台账号文件、上传文件、备份和 `node_modules`。

## 本地开发

```bash
cd blog-backend
cp .env.example .env
npm install
npm run init
npm start
```

后台管理端：

```bash
cd blog-backend
npm run admin:install
npm run admin:build
```

`admin:build` 会把后台产物写入 `blog-backend/public/admin/`，该目录是部署产物目录，不作为源码提交。

## 文档

- [架构说明](docs/architecture.md)
- [部署说明](docs/deployment.md)
- [运维说明](docs/operations.md)

## 提交前检查

```bash
git status --short
git grep -n "DB_PASSWORD\|ADMIN_PASSWORD\|SESSION_SECRET\|MEILI_MASTER_KEY" -- .
```

确认输出里只有 `.env.example` 的占位值，不能出现真实密码、Token、上传文件或备份文件。
