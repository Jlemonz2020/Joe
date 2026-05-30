# 运维说明

## 常用命令

查看后端状态：

```bash
systemctl status yifang-blog
journalctl -u yifang-blog -n 100 --no-pager
```

重启后端：

```bash
sudo systemctl restart yifang-blog
```

检查 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 备份

后端提供 `scripts/backup.sh`，会备份 MySQL 数据和 `uploads/`，输出到 `/data/blog-backend/backups/<时间戳>/`。定时器配置在：

- `blog-backend/scripts/yifang-blog-backup.service`
- `blog-backend/scripts/yifang-blog-backup.timer`

启用定时备份：

```bash
sudo cp /data/blog-backend/scripts/yifang-blog-backup.service /etc/systemd/system/
sudo cp /data/blog-backend/scripts/yifang-blog-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yifang-blog-backup.timer
```

手动备份：

```bash
/data/blog-backend/scripts/backup.sh
```

## 恢复

恢复前先停止后端：

```bash
sudo systemctl stop yifang-blog
```

恢复上传文件：

```bash
cd /data/blog-backend
tar -xzf backups/<时间戳>/uploads.tar.gz
```

恢复数据库时使用对应 MySQL 实例的账号执行：

```bash
mysql -h127.0.0.1 -u<user> -p yifang_blog < backups/<时间戳>/mysql.sql
```

恢复后重启服务：

```bash
sudo systemctl start yifang-blog
npm run sync-search
```

## 内容维护

- 文章、项目、瞬间、文案和站点设置从 `/admin` 后台维护。
- 项目正文支持 Markdown，保存后前台 API 会返回最新内容。
- 搜索索引可以通过后台按钮或 `npm run sync-search` 重建。
- 评论和点赞按 target 绑定，文章和项目详情页各自独立。

## 可视化编辑流程

1. 后台打开前台预览，预览地址会带 `?editor=1`。
2. 点击前台可编辑元素后，后台根据目标类型显示编辑表单。
3. 保存草稿只进入后台草稿，不影响正式页面。
4. 发布后才写入前台配置或静态资源。
5. 如果发布结果不符合预期，使用恢复接口回到最近一次可用状态。

## 排查要点

- 前台静态资源不更新：检查 HTML 中资源版本号和浏览器缓存。
- `/api/*` 失败：先看 `journalctl -u yifang-blog`，再看 Nginx 反代配置。
- 后台打不开：确认 `/admin` 是否在内网访问范围内，并检查 `public/admin/` 是否已构建。
- 搜索无结果：确认 Meilisearch 正常运行，并执行 `npm run sync-search`。
- 上传文件 404：确认文件在 `/data/blog-backend/uploads`，Nginx `alias` 路径和权限正确。
