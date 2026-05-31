import { config } from "../src/config.js";
import { pool, query, getOne } from "../src/db.js";
import { hashPassword, verifyPassword } from "../src/auth.js";
import { markdownToHtml } from "../src/markdown.js";
import { syncSearchIndex } from "../src/search.js";

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    created_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS categories (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS posts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    summary VARCHAR(500) DEFAULT '',
    content_md MEDIUMTEXT NOT NULL,
    cover_url VARCHAR(500) DEFAULT '',
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    category_id BIGINT NULL,
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FULLTEXT KEY ft_posts (title, summary, content_md)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS moments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    content TEXT NOT NULL,
    kind ENUM('project','life','tech') NOT NULL DEFAULT 'life',
    tags JSON NULL,
    image_url VARCHAR(500) DEFAULT '',
    status ENUM('draft','published') NOT NULL DEFAULT 'published',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS projects (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    status_text VARCHAR(255) NOT NULL,
    progress INT NOT NULL DEFAULT 0,
    last_update VARCHAR(255) DEFAULT '',
    status ENUM('active','archived') NOT NULL DEFAULT 'active',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NULL,
    updated_at DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS media (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    filename VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    mime VARCHAR(120) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS comments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    target VARCHAR(160) NOT NULL,
    author_name VARCHAR(80) NOT NULL,
    author_email VARCHAR(160) DEFAULT '',
    content TEXT NOT NULL,
    status ENUM('pending','published','hidden') NOT NULL DEFAULT 'published',
    created_at DATETIME NOT NULL,
    INDEX idx_comments_target (target, status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS reactions (
    target VARCHAR(160) NOT NULL,
    kind VARCHAR(40) NOT NULL,
    count INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (target, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS site_settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

for (const statement of schema) await query(statement);

function passwordMatches(password, storedHash) {
  try {
    return verifyPassword(password, storedHash);
  } catch {
    return false;
  }
}

const migrations = [
  "ALTER TABLE projects ADD COLUMN slug VARCHAR(160) NULL",
  "ALTER TABLE projects ADD COLUMN summary VARCHAR(500) DEFAULT ''",
  "ALTER TABLE projects ADD COLUMN content_md MEDIUMTEXT NULL",
  "ALTER TABLE projects ADD COLUMN cover_url VARCHAR(500) DEFAULT ''",
  "ALTER TABLE projects ADD COLUMN created_at DATETIME NULL",
  "ALTER TABLE projects ADD COLUMN updated_at DATETIME NULL",
  "ALTER TABLE projects ADD UNIQUE KEY uq_projects_slug (slug)"
];

for (const statement of migrations) {
  try {
    await query(statement);
  } catch (error) {
    if (![1060, 1061].includes(error.errno)) throw error;
  }
}

await query("UPDATE projects SET created_at=NOW() WHERE created_at IS NULL").catch(() => {});
await query("UPDATE projects SET updated_at=NOW() WHERE updated_at IS NULL").catch(() => {});

const adminUsername = String(config.admin.username || "").trim();
const adminPassword = String(config.admin.password ?? "");
const user = await getOne("SELECT id,password_hash FROM users WHERE username=:username", { username: adminUsername });
if (!user) {
  await query("INSERT INTO users(username,password_hash,created_at) VALUES(:username,:hash,NOW())", {
    username: adminUsername,
    hash: hashPassword(adminPassword)
  });
} else if (adminPassword && !passwordMatches(adminPassword, user.password_hash)) {
  await query("UPDATE users SET password_hash=:hash WHERE id=:id", {
    id: user.id,
    hash: hashPassword(adminPassword)
  });
}

const categories = [
  ["Linux", "linux", "命令、驱动、系统记录"],
  ["树莓派", "raspberry-pi", "家庭服务器和小实验"],
  ["服务器", "server", "Nginx、Docker、备份"],
  ["生活", "life", "不太正式的碎片"]
];
for (const [name, slug, description] of categories) {
  await query("INSERT IGNORE INTO categories(name,slug,description) VALUES(:name,:slug,:description)", { name, slug, description });
}

await query(`INSERT INTO site_settings(setting_key,setting_value,updated_at)
  VALUES('github_username',:username,NOW())
  ON DUPLICATE KEY UPDATE setting_value=setting_value`, { username: config.github.username || "Jlemonz" });

const postCount = await getOne("SELECT COUNT(*) AS count FROM posts");
if (!postCount.count) {
  await query(`INSERT INTO posts(title,slug,summary,content_md,status,category_id,published_at,created_at,updated_at)
    VALUES(:title,:slug,:summary,:content_md,'published',(SELECT id FROM categories WHERE slug='server'),NOW(),NOW(),NOW())`, {
    title: "家庭服务器入口整理记录",
    slug: "home-server-entry-notes",
    summary: "把公开入口、私有服务和静态站点分开，后面维护时不容易混在一起。",
    content_md: "# 家庭服务器入口整理记录\n\n先把公开页面、后台入口和私有服务分开。公开页面只放博客和普通内容，后台只在内网访问。\n\n```bash\n# 记录比记忆可靠\nsystemctl status nginx\n```\n\n后面要补的是备份策略和恢复步骤。"
  });
}

const momentCount = await getOne("SELECT COUNT(*) AS count FROM moments");
if (!momentCount.count) {
  const moments = [
    ["今天把家庭服务器的入口重新整理了一遍。", "project", ["服务器", "博客"]],
    ["驱动学习卡在设备树绑定，先记一下坑。", "tech", ["Linux", "驱动学习"]],
    ["博客首页又改了一版，终于没那么模板了。", "project", ["博客", "前端"]],
    ["晚上只想把照片备份好，结果顺手又看了半小时日志。", "life", ["生活", "备份"]]
  ];
  for (const [content, kind, tags] of moments) {
    await query("INSERT INTO moments(content,kind,tags,status,created_at,updated_at) VALUES(:content,:kind,:tags,'published',NOW(),NOW())", {
      content,
      kind,
      tags: JSON.stringify(tags)
    });
  }
}

const projectDetails = {
  "raspberry-pi-server": {
    summary: "还在整理，先把公开入口、静态站点和私有服务的边界写清楚。",
    content: `# 树莓派家庭服务器

这个项目先不追求一次性整理完，重点是把能公开访问的页面、只在内网用的后台、以及需要备份的服务分成几类。以后换机器或重装系统时，至少能知道哪些东西必须先恢复。

## 当前状态

- 博客静态目录已经单独放在站点目录，前端资源可以直接由 Nginx 提供。
- 后端服务只监听本机地址，再由 Nginx 反代到公开页面需要的 API。
- 管理入口和私有服务不写进公开前端，避免后面维护时顺手暴露出去。
- 端口、域名和服务清单统一记录在服务器上的信息文件里。

## 最近一次推进

这次主要把博客和后台的责任拆开：前台只负责阅读、项目、瞬间、评论和点赞；后台负责 GitHub 账号绑定、内容维护、评论管理和搜索索引。这样以后加文章页、照片归档或备份任务，不需要再把所有配置塞进前端。

## 下一步

- 补一篇完整的家庭服务器部署记录。
- 把备份恢复流程写成可以照着执行的清单。
- 给公开站点和内网后台分别做健康检查。
- 记录每个服务的升级方式和回滚办法。`
  },
  "linux-driver-learning": {
    summary: "卡在设备树绑定，先把概念、调用链和常见坑拆成能复盘的小记录。",
    content: `# Linux 驱动学习

这个项目不是做成教程合集，而是记录自己从看不懂到能定位问题的过程。驱动学习最容易卡在“知道名词，但不知道它在系统里什么时候发生”，所以每次推进都尽量留下调用链、关键结构体和验证命令。

## 当前状态

- 设备树 binding 还在梳理，重点是 compatible、pinctrl、clock、reset 这些字段和驱动 probe 的关系。
- 准备把常见外设拆成几条线：GPIO、I2C、SPI、platform driver。
- 每次实验都尽量留最小复现，不把板级配置和驱动逻辑混在一起。

## 最近一次推进

先把设备树节点和驱动匹配流程单独拎出来，后面再补图。现在最需要的是把“设备树描述了什么”和“驱动实际拿到了什么”分开看，否则调试时很容易只盯着 DTS 改。

## 下一步

- 画一张 platform driver probe 流程图。
- 整理一份设备树绑定字段速查。
- 给每个实验保留 dmesg、config 和 DTS 片段。
- 写一篇“为什么 probe 没进来”的排查记录。`
  },
  "rk3576-bsp": {
    summary: "能跑，但不稳，先按启动、外设、日志和回滚四条线慢慢收敛。",
    content: `# RK3576 BSP 实验

这个项目主要记录板子实验过程。现在的目标不是把所有外设都一次调通，而是把能启动、能复现、能回滚这三件事先稳住。BSP 实验很容易因为改动太散导致回不去，所以记录比速度更重要。

## 当前状态

- 系统能启动，但部分外设状态还不稳定。
- pinctrl、clock、reset 相关配置需要逐项核对。
- 每次改 DTS 或 defconfig 都需要留下差异和验证结果。
- 先把启动日志、内核配置和设备树版本绑定起来。

## 最近一次推进

目前先不继续盲改外设配置，准备按模块拆记录：启动链路、存储、网络、显示、常用总线。每一块都只保留必要结论，避免后面翻记录时被临时猜测干扰。

## 下一步

- 固定一份可回滚的基线镜像。
- 整理启动日志中的 warning 和 error。
- 把 pinctrl 与 clock 配置按外设归档。
- 给每次可用状态打标签，方便回退。`
  },
  "jlemonz-blog": {
    summary: "首页第一版已经能用，后面要把文章页、项目详情、评论和搜索做成长期维护结构。",
    content: `# 个人博客重构

Jlemonz 不是展示页，主要用来长期记录系统折腾、项目进展、学习笔记和一些日常碎片。这次重构的重点是把“好看的一页”变成“可以继续维护的一套站点”。

## 当前状态

- 首页、瞬间、归档、项目、项目详情、关于页已经拆成独立页面。
- GitHub 近期频率改为后端配置账号，前端只展示结果。
- 评论和点赞按 target 绑定，项目详情页使用独立的 project:id 目标。
- 主题不只换颜色，也会改变背景图、卡片形态、按钮和模块气质。

## 最近一次推进

把项目从首页卡片扩展成独立详情页，并把评论区挂到每个项目上。这样以后每个项目都能有自己的进展记录和留言，不会全部挤在一个全局留言板里。

## 下一步

- 补文章详情页和文章管理的编辑体验。
- 给 GitHub 频率加 Redis 缓存或定时同步。
- 把 Meilisearch 搜索结果样式做得更像站内工具。
- 给评论增加审核状态和管理批量操作。`
  }
};

const projectCount = await getOne("SELECT COUNT(*) AS count FROM projects");
if (!projectCount.count) {
  const projects = [
    ["树莓派家庭服务器", "还在整理，先把公开入口和私有服务分清楚。", 78, "最近更新：今天", 1, "raspberry-pi-server"],
    ["Linux 驱动学习", "卡在设备树绑定，准备把调用链重新画一遍。", 42, "最近更新：昨天", 2, "linux-driver-learning"],
    ["RK3576 BSP 实验", "能跑，但不稳，先把 pinctrl 和 clock 记清楚。", 34, "最近更新：前天", 3, "rk3576-bsp"],
    ["个人博客重构", "已完成第一版，接下来补文章页和移动端细节。", 64, "最近更新：今天", 4, "jlemonz-blog"]
  ];
  for (const [name, status_text, progress, last_update, sort_order, slug] of projects) {
    await query(`INSERT INTO projects(name,status_text,progress,last_update,sort_order,slug,summary,content_md,created_at,updated_at)
      VALUES(:name,:status_text,:progress,:last_update,:sort_order,:slug,:summary,:content_md,NOW(),NOW())`, {
      name,
      status_text,
      progress,
      last_update,
      sort_order,
      slug,
      summary: projectDetails[slug]?.summary || status_text,
      content_md: projectDetails[slug]?.content || `# ${name}\n\n${status_text}\n\n## 当前状态\n\n进度先按阶段记录，不当成 KPI。后面每次推进都补到这里，方便从中断处捡回来。\n\n## 下一步\n\n- 补一次完整复盘\n- 整理相关命令和截图\n- 把能复用的部分单独拆出来`
    });
  }
}

const projectRows = await query("SELECT id,name,status_text,slug,summary,content_md FROM projects ORDER BY sort_order ASC,id ASC");
const fallbackSlugs = ["raspberry-pi-server", "linux-driver-learning", "rk3576-bsp", "jlemonz-blog"];
for (const [index, project] of projectRows.entries()) {
  const slug = project.slug || fallbackSlugs[index] || `project-${project.id}`;
  const detail = projectDetails[slug];
  const existingContent = project.content_md || "";
  const usesOldPlaceholder = !existingContent ||
    existingContent.includes("这里会继续补项目背景") ||
    existingContent.includes("进度先按阶段记录，不当成 KPI");
  const summary = project.summary || detail?.summary || project.status_text || "";
  const content_md = usesOldPlaceholder && detail
    ? detail.content
    : existingContent || `# ${project.name}\n\n${project.status_text || ""}\n\n## 当前状态\n\n这里会继续补项目背景、阶段记录和下一步计划。`;
  await query("UPDATE projects SET slug=:slug, summary=:summary, content_md=:content_md WHERE id=:id", {
    id: project.id,
    slug,
    summary,
    content_md
  });
}

await syncSearchIndex().catch(() => {});
await pool.end();
console.log("database initialized");
