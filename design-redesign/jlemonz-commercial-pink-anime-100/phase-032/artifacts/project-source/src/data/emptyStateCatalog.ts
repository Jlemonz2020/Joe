export const emptyStateCatalog = [
  {
    context: "posts",
    tone: "notes",
    title: "资料夹还在等第一张书签",
    body: "第一篇长记录整理好后，赛蕾会把它钉在这里。"
  },
  {
    context: "projects",
    tone: "projects",
    title: "任务板还没有公开档案",
    body: "下一个服务或硬件实验整理完成后，再放进这块板。"
  },
  {
    context: "search",
    tone: "search",
    title: "检索抽屉还没有命中线索",
    body: "换一个关键词，赛蕾再帮你翻一遍资料夹。"
  },
  {
    context: "comments",
    tone: "comments",
    title: "留言区还在留座",
    body: "第一条留言出现后，这里会变成新的对话便签。"
  },
  {
    context: "moments",
    tone: "moments",
    title: "便签纸还留着空位",
    body: "下一次折腾冒出火花，就把它贴进时间线。"
  }
];

export const emptyStateRules = [
  "Do not show raw blank-data labels.",
  "Keep the tone warm, concrete, and short.",
  "Use Sailei as a companion cue, not a mascot that interrupts reading.",
  "Every empty state needs a clear context in `data-empty-tone`."
];
