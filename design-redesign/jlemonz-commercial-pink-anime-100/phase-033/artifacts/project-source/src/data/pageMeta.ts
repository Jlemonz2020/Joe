export const pages = {
  home: {
    nav: "首页",
    href: "/index.html",
    title: "Jlemonz",
    kicker: "Pi5 / Linux / AI",
    lead: "在 Pi5、Linux、硬件和 AI 之间，整理那些值得回看的折腾。",
    role: "Sailei desk entrance"
  },
  moments: {
    nav: "瞬间",
    href: "/moments.html",
    title: "瞬间",
    kicker: "moments",
    lead: "随手贴下今天的折腾、灵感和小事，给时间线留一点粉色标记。",
    role: "Sticky-note feed"
  },
  archive: {
    nav: "笔记",
    href: "/archive.html",
    title: "笔记",
    kicker: "notes",
    lead: "长文、调试和学习笔记收进资料库，下一次遇到同类问题时能直接翻回现场。",
    role: "Notebook archive"
  },
  projects: {
    nav: "项目",
    href: "/projects.html",
    title: "项目",
    kicker: "projects",
    lead: "服务、硬件和页面改造都按任务档案整理，保留状态、进展和下一步。",
    role: "Mission board"
  },
  about: {
    nav: "关于",
    href: "/about.html",
    title: "关于",
    kicker: "about",
    lead: "一个在 Linux、硬件和 AI 之间慢慢补课的人，也把这座小站当成长期练习场。",
    role: "Character profile"
  }
} as const;

export type PageKey = keyof typeof pages;
