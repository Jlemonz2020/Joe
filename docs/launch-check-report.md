# 上线前体检记录

检查日期：2026-08-23

## 已修复

- 面试题实例按钮：题库卡片和日练卡片都支持单独点击“实例”，无需先展开答案。
- 静态资源缓存：全站资源版本更新为 `launch-20260823c`，HTML 不缓存，版本化 CSS/JS 长缓存。
- 天气定位：浏览器定位优先；浏览器定位不可用时，后端短时间尝试 IP 城市定位，超时后兜底并后台刷新缓存。
- DDV 歌单：扩大候选池，并按日期打散轮换；后端每日快照和资源缓存优先。
- 页尾歌词：改为短句池轮换，不再固定单句。
- GitHub 归档：只保留静态网页、前端资源和公开品牌图，剔除服务端私密配置和数据。

## 检查结果

- `node --check work/live-current/app.js`：通过。
- `node --check work/live-current/server.js`：通过。
- 编码扫描：通过，未发现异常编码、旧页尾标记或旧资源版本号。
- 归档 JS 检查：`node --check assets/app.js` 通过。
- 归档敏感扫描：未发现已知高风险密钥、连接串或登录凭据片段。
- 静态页面请求：`index/moments/archive/projects/project/post/interview/about` 均返回 200。
- 静态资源请求：`assets/style.css`、`assets/app.js`、品牌 logo 均返回 200。

## 归档目录

目标目录：`C:\Users\Jlemonz\Desktop\Project\Joe`

归档内容：HTML 页面、`assets/app.js`、`assets/style.css`、品牌图标、README、上传清单、软著材料。

## 注意

归档是公开静态版，不包含后端数据库、接口服务、后台配置和私密上传资源。完整动态站点上线时，应使用服务器端项目和正式环境配置。