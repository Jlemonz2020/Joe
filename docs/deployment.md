# 部署说明

## 环境变量

```bash
cp blog-backend/.env.example blog-backend/.env
```

将数据库、Redis、会话签名和管理员密码改为服务器专用值。不要把 `.env` 放进 Git，也不要把生产数据库复制进仓库。

## 启动后端

```bash
cd blog-backend
npm ci
npm run admin:install
npm run admin:build
npm start
```

Node 服务默认监听 `127.0.0.1:8097`。启动时会检查并创建当前版本所需数据表；已有生产数据库不会随本仓库同步。

## Nginx

`ops/nginx.conf` 是代理规则参考。部署时把其中的证书路径、静态根目录和上游服务名改成实际环境，不要把证书私钥提交到仓库。

建议：HTML 使用 `no-store` 或短缓存；带内容哈希的 CSS、JS 使用长期缓存；上传目录单独代理并限制可接受的文件类型和大小。
