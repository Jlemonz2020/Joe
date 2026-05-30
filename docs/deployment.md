# 部署说明

## 目标路径

树莓派当前约定路径：

| 内容 | 路径 |
| --- | --- |
| 后端 | `/data/blog-backend` |
| 前台静态页面 | `/data/sites/blog/html` |
| 上传文件 | `/data/blog-backend/uploads` |
| 备份 | `/data/blog-backend/backups` |
| Nginx 配置参考 | `ops/pi-sites.conf` |

## 首次部署

1. 安装 Node.js、MySQL、Redis、Meilisearch 和 Nginx。
2. 同步后端源码到 `/data/blog-backend`。
3. 根据 `.env.example` 创建 `/data/blog-backend/.env`，填写真实密码和密钥。
4. 安装依赖并初始化数据库：

```bash
cd /data/blog-backend
npm install
npm run admin:install
npm run admin:build
npm run init
```

5. 安装 systemd 服务：

```bash
sudo cp /data/blog-backend/scripts/yifang-blog.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yifang-blog
```

6. 同步前台静态页面到 `/data/sites/blog/html`。
7. 参考 `ops/pi-sites.conf` 配置 Nginx，然后检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 日常发布

后端发布：

```bash
cd /data/blog-backend
git pull
npm install
npm run admin:build
sudo systemctl restart yifang-blog
```

前台发布：

```bash
rsync -av --delete blog-redesign/ pi5@192.168.31.248:/data/sites/blog/html/
```

从本机同步后端时要排除运行时数据：

```bash
rsync -av --delete \
  --exclude .env \
  --exclude ADMIN-CREDENTIALS.txt \
  --exclude node_modules \
  --exclude uploads \
  --exclude backups \
  blog-backend/ pi5@192.168.31.248:/data/blog-backend/
```

## 服务端口

- `8086`：网站 HTTPS 入口。
- `8097`：Node 后端，仅监听本机。
- `3306`：MySQL。
- `6379`：Redis。
- `7700`：Meilisearch。

## 回滚

代码回滚优先回到上一个 Git 提交，再重建后台并重启服务：

```bash
cd /data/blog-backend
git log --oneline -5
git checkout <commit>
npm run admin:build
sudo systemctl restart yifang-blog
```

如果涉及数据库或上传文件，先参考 [运维说明](operations.md) 的备份恢复流程。
