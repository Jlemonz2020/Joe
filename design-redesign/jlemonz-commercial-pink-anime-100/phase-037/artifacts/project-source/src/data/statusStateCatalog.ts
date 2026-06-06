export const statusStateCatalog = {
  loading: {
    ribbon: "SYNCING",
    cue: "SYNC",
    title: "正在同步手帐格",
    body: "赛蕾正在把资料贴进粉色索引，等一小会儿。"
  },
  error: {
    ribbon: "MEMO HOLD",
    cue: "FIX",
    title: "这张便签暂时贴不上",
    body: "先保留当前位置，稍后再重新同步。"
  },
  offline: {
    ribbon: "LINK LOST",
    cue: "LINK",
    title: "网络像断开的丝带",
    body: "本地页面还在，恢复连接后再继续翻资料。"
  },
  timeout: {
    ribbon: "WAITING",
    cue: "WAIT",
    title: "同步等得有点久",
    body: "这次请求先停在这里，稍后再试会更稳。"
  }
} as const;

export type StatusStateKind = keyof typeof statusStateCatalog;

export const statusStateRules = [
  "Never render debug traces, unprocessed failure messages, or transport codes as user-facing copy.",
  "Use `data-status-kind` for loading, error, offline, and timeout verification.",
  "Keep status copy short enough for mobile cards.",
  "Use soft pink diary language instead of terminal alerts."
] as const;
