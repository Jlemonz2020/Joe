# GitHub 上传步骤

本机最终只保留 `Joe` 一个项目目录。PowerShell 或终端中进入本目录：

```bash
cd C:/Users/Jlemonz/Desktop/Project/Joe
git add .
git status
git commit -m "consolidate Joe project and separate secrets"
git push -u origin main
```

远程仓库是 `https://github.com/Jlemonz2020/Joe.git`。不要把 GitHub Token 写进命令、脚本或文档；需要认证时使用 Git Credential Manager、GitHub CLI 或 SSH 公钥认证。

## 前台与后端

GitHub Pages 适合发布 `blog-redesign/` 的静态页面，但它不能运行 Node、MySQL、Redis 或后台管理端。完整部署应当是：

1. GitHub 保存本仓库代码。
2. 服务器克隆仓库并在 `blog-backend/` 安装依赖、配置 `.env` 和 `config/keys.env`。
3. 启动 Node 后端，使用 `ops/nginx.conf` 配置静态页面和 API 代理。
4. 数据库、上传图片、Redis 数据和所有 Secret 保留在服务器卷或 Secret 管理器中。

上传前确认：

```bash
git status --ignored --short
git ls-files | grep -Ei '(^|/)(\.env|keys\.env|.*\.pem|.*\.key|.*\.sql|.*\.db|uploads|backups|node_modules|^private/)'
```

第二条命令应当没有输出。`.env.example` 和 `blog-backend/config/keys.example.env` 是不含真实值的配置模板，可以保留。
