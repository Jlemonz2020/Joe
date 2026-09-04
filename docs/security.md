# GitHub 上传前安全检查

1. 确认 `blog-backend/.env` 不存在于待提交目录。
2. 确认 `blog-backend/config/keys.env` 只存在本机或服务器，不能进入 Git。
3. 确认没有数据库文件、SQL 导出、上传目录、备份、日志、`private/` 和 `node_modules`。
4. 确认源码中没有真实密码、Token、API Key、SSH 私钥、证书私钥或服务器登录命令。
5. 服务器上的真实配置只通过环境变量、`keys.env` 或部署平台 Secret 注入。
6. 若任何密钥曾经误提交到 Git 历史，先在服务商处撤销并重新生成，再清理 Git 历史。

可以用下面的命令做提交前检查：

```bash
git status --short
git ls-files | grep -Ei '(^|/)(\.env|keys\.env|.*\.pem|.*\.key|.*\.sql|.*\.db|uploads|backups|node_modules|private/)'
```

第二条命令正常应无输出；`.env.example` 和 `blog-backend/config/keys.example.env` 是有意保留的占位模板。
