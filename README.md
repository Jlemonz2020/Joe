# Joe

Joe 是一个个人技术档案网站，包含当前前台页面、Node.js 后端 API 和 Vue 后台管理端。前台内容围绕 Ubuntu、ROS、FOC、嵌入式和项目复盘组织，后台用于维护文章、瞬间、项目、面试题库、About 图库和站点配置。

## 目录

| 路径 | 作用 |
| --- | --- |
| `blog-redesign/` | 当前前台 HTML、CSS、JavaScript 和公开品牌资源 |
| `blog-backend/src/` | Node.js API、鉴权、缓存、数据库和内容接口 |
| `blog-backend/admin-src/` | Vue 3 + Vite + Element Plus 后台源码 |
| `blog-backend/config/` | 密钥配置模板；真实 `keys.env` 只保留在本机或服务器 |
| `blog-backend/scripts/` | 搜索索引脚本 |
| `ops/` | Nginx 配置参考 |
| `docs/` | 架构、部署、安全和软著说明 |
| `private/` | 本机私有资料目录，已被 Git 忽略，不上传 |

## 安全边界

本仓库只包含代码、公开静态资源和可公开说明文档，不包含生产数据库、上传图片、日志、备份、SSH 密钥、root 密码、API Key 或后台真实密码。部署前复制 `blog-backend/.env.example` 为 `.env`，再复制 `blog-backend/config/keys.example.env` 为 `blog-backend/config/keys.env`；真实密钥只写入 `keys.env` 或服务器 Secret，两个真实配置文件都已被 Git 忽略。

提交前执行：

```bash
git status --short
git grep -n -i "password\|token\|secret\|api_key\|private key" -- ':!blog-backend/.env.example' ':!blog-backend/config/keys.example.env' ':!docs/software-copyright/*'
```

示例配置里的字段名和占位值可以出现，真实值不可以出现。

## 本地运行

需要 Node.js 20+、MySQL 8+；Redis 和 Meilisearch 是可选服务，分别用于缓存和搜索增强。后端启动时会检查并创建当前版本所需的数据表。

```bash
cd blog-backend
cp .env.example .env
cp config/keys.example.env config/keys.env
npm install
npm start
```

前台文件由后端按相邻目录结构读取，保持仓库目录结构不变即可。访问 `http://127.0.0.1:8097/`。

构建后台：

```bash
cd blog-backend
npm run admin:install
npm run admin:build
```

构建产物写入 `blog-backend/public/admin/`，该目录只作为部署产物，不提交到 Git。生产环境建议由 Nginx 提供 `blog-redesign/` 静态页面，并把 `/api/`、`/admin` 和 `/uploads/` 代理到 Node 服务。

## 说明

当前线上内容和用户数据不随代码归档。克隆项目后需要自行准备数据库、管理员账号和运行环境，避免把个人站点数据误提交到公开仓库。
