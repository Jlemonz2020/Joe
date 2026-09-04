const base = "/admin/api";

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    ...options,
    headers,
    body
  });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof data === "object" ? data.message || data.error : data;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return data;
}

export const adminApi = {
  login: (body) => api("/login", { method: "POST", body }),
  logout: () => api("/logout", { method: "POST" }),
  me: () => api("/me"),
  overview: () => api("/overview"),
  syncSearch: () => api("/sync-search", { method: "POST" }),
  uploadImage: async (file) => {
    const body = new FormData();
    body.append("file", file);
    return api("/uploads", { method: "POST", body });
  },
  listPosts: (params = "") => api(`/posts${params}`),
  getPost: (id) => api(`/posts/${id}`),
  savePost: (item) => api(item.id ? `/posts/${item.id}` : "/posts", { method: item.id ? "PUT" : "POST", body: item }),
  hidePost: (id) => api(`/posts/${id}/hide`, { method: "POST" }),
  restorePost: (id, body = {}) => api(`/posts/${id}/restore`, { method: "POST", body }),
  destroyPost: (id) => api(`/posts/${id}`, { method: "DELETE" }),
  listMoments: (params = "") => api(`/moments${params}`),
  saveMoment: (item) => api(item.id ? `/moments/${item.id}` : "/moments", { method: item.id ? "PUT" : "POST", body: item }),
  hideMoment: (id) => api(`/moments/${id}/hide`, { method: "POST" }),
  restoreMoment: (id, body = {}) => api(`/moments/${id}/restore`, { method: "POST", body }),
  destroyMoment: (id) => api(`/moments/${id}`, { method: "DELETE" }),
  listHzQuotes: (params = "") => api(`/hz-quotes${params}`),
  saveHzQuote: (item) => api(item.id ? `/hz-quotes/${item.id}` : "/hz-quotes", { method: item.id ? "PUT" : "POST", body: item }),
  publishHzQuote: (id) => api(`/hz-quotes/${id}/publish`, { method: "POST" }),
  hideHzQuote: (id) => api(`/hz-quotes/${id}/hide`, { method: "POST" }),
  restoreHzQuote: (id) => api(`/hz-quotes/${id}/restore`, { method: "POST" }),
  destroyHzQuote: (id) => api(`/hz-quotes/${id}`, { method: "DELETE" }),
  listProjects: (params = "") => api(`/projects${params}`),
  getProject: (id) => api(`/projects/${id}`),
  saveProject: (item) => api(item.id ? `/projects/${item.id}` : "/projects", { method: item.id ? "PUT" : "POST", body: item }),
  hideProject: (id) => api(`/projects/${id}/hide`, { method: "POST" }),
  restoreProject: (id, body = {}) => api(`/projects/${id}/restore`, { method: "POST", body }),
  destroyProject: (id) => api(`/projects/${id}`, { method: "DELETE" }),
  listInterviews: (params = "") => api(`/interviews${params}`),
  listInterviewTopics: (params = "") => api(`/interview-topics${params}`),
  saveInterviewTopic: (item) => api(item.id ? `/interview-topics/${item.id}` : "/interview-topics", { method: item.id ? "PUT" : "POST", body: item }),
  hideInterviewTopic: (id) => api(`/interview-topics/${id}/hide`, { method: "POST" }),
  publishInterviewTopic: (id) => api(`/interview-topics/${id}/publish`, { method: "POST" }),
  destroyInterviewTopic: (id) => api(`/interview-topics/${id}`, { method: "DELETE" }),
  listInterviewGoals: (params = "") => api(`/interview-goals${params}`),
  saveInterviewGoal: (item) => api(item.id ? `/interview-goals/${item.id}` : "/interview-goals", { method: item.id ? "PUT" : "POST", body: item }),
  publishInterviewGoal: (id) => api(`/interview-goals/${id}/publish`, { method: "POST" }),
  hideInterviewGoal: (id) => api(`/interview-goals/${id}/hide`, { method: "POST" }),
  destroyInterviewGoal: (id) => api(`/interview-goals/${id}`, { method: "DELETE" }),
  listInterviewGoalUpdates: (params = "") => api(`/interview-goal-updates${params}`),
  saveInterviewGoalUpdate: (item) => api(item.id ? `/interview-goal-updates/${item.id}` : "/interview-goal-updates", { method: item.id ? "PUT" : "POST", body: item }),
  publishInterviewGoalUpdate: (id) => api(`/interview-goal-updates/${id}/publish`, { method: "POST" }),
  hideInterviewGoalUpdate: (id) => api(`/interview-goal-updates/${id}/hide`, { method: "POST" }),
  destroyInterviewGoalUpdate: (id) => api(`/interview-goal-updates/${id}`, { method: "DELETE" }),
  listInterviewQuestions: (params = "") => api(`/interview-questions${params}`),
  saveInterviewQuestion: (item) => api(item.id ? `/interview-questions/${item.id}` : "/interview-questions", { method: item.id ? "PUT" : "POST", body: item }),
  publishInterviewQuestion: (id) => api(`/interview-questions/${id}/publish`, { method: "POST" }),
  hideInterviewQuestion: (id) => api(`/interview-questions/${id}/hide`, { method: "POST" }),
  destroyInterviewQuestion: (id) => api(`/interview-questions/${id}`, { method: "DELETE" }),
  interviewDailyStatus: (params = "") => api(`/interview-daily${params}`),
  publishInterviewDaily: (body = {}) => api("/interview-daily/publish", { method: "POST", body }),
  listInterviewReviews: (params = "") => api(`/interview-reviews${params}`),
  saveInterviewReview: (item) => api(item.id ? `/interview-reviews/${item.id}` : "/interview-reviews", { method: item.id ? "PUT" : "POST", body: item }),
  publishInterviewReview: (id) => api(`/interview-reviews/${id}/publish`, { method: "POST" }),
  hideInterviewReview: (id) => api(`/interview-reviews/${id}/hide`, { method: "POST" }),
  destroyInterviewReview: (id) => api(`/interview-reviews/${id}`, { method: "DELETE" }),
  getInterview: (id) => api(`/interviews/${id}`),
  saveInterview: (item) => api(item.id ? `/interviews/${item.id}` : "/interviews", { method: item.id ? "PUT" : "POST", body: item }),
  hideInterview: (id) => api(`/interviews/${id}/hide`, { method: "POST" }),
  restoreInterview: (id, body = {}) => api(`/interviews/${id}/restore`, { method: "POST", body }),
  destroyInterview: (id) => api(`/interviews/${id}`, { method: "DELETE" }),
  listComments: (params = "") => api(`/comments${params}`),
  saveComment: (item) => api(`/comments/${item.id}`, { method: "PUT", body: item }),
  publishComment: (id) => api(`/comments/${id}/publish`, { method: "POST" }),
  hideComment: (id) => api(`/comments/${id}/hide`, { method: "POST" }),
  restoreComment: (id, body = {}) => api(`/comments/${id}/restore`, { method: "POST", body }),
  destroyComment: (id) => api(`/comments/${id}`, { method: "DELETE" }),
  batchContent: (resource, action, ids) => api(`/${resource}/batch`, { method: "POST", body: { action, ids } }),
  contentExportUrl: (resource, params = "") => `${base}/${resource}/export${params}`,
  getSiteTexts: () => api("/site-texts"),
  saveSiteTexts: (body) => api("/site-texts", { method: "PUT", body }),
  getAboutGallery: () => api("/about-gallery"),
  saveAboutGallery: (body) => api("/about-gallery", { method: "PUT", body }),
  getFrontendEditor: () => api("/frontend-editor"),
  saveFrontendDraft: (payload) => api("/frontend-editor/draft", { method: "PUT", body: { payload } }),
  deleteFrontendDraft: () => api("/frontend-editor/draft", { method: "DELETE" }),
  publishFrontendEditor: (payload) => api("/frontend-editor/publish", { method: "POST", body: { payload } }),
  restoreFrontendEditor: () => api("/frontend-editor/restore", { method: "POST" }),
  getSettings: () => api("/settings"),
  saveSettings: (body) => api("/settings", { method: "PUT", body }),
  systemStatus: () => api("/system-status"),
  taskCenter: () => api("/task-center"),
  interactionInsights: (params = "") => api(`/interaction-insights${params}`),
  integrations: () => api("/integrations"),
  syncGithubRepos: (body = {}) => api("/integrations/github/sync", { method: "POST", body }),
  refreshGithubContributions: (body = {}) => api("/integrations/github/contributions/refresh", { method: "POST", body }),
  auditInsights: (params = "") => api(`/audit-insights${params}`),
  roles: () => api("/roles"),
  saveRole: (item) => api(item.id ? `/roles/${item.id}` : "/roles", { method: item.id ? "PUT" : "POST", body: item }),
  users: () => api("/users"),
  updateUserRoles: (id, roles) => api(`/users/${id}/roles`, { method: "PUT", body: { roles } }),
  listPageBlocks: (params = "") => api(`/page-blocks${params}`),
  savePageBlock: (item) => api(item.id ? `/page-blocks/${item.id}` : "/page-blocks", { method: item.id ? "PUT" : "POST", body: item }),
  hidePageBlock: (id) => api(`/page-blocks/${id}`, { method: "DELETE" }),
  listThemeSettings: () => api("/theme-settings"),
  saveThemeSetting: (item) => api(item.id ? `/theme-settings/${item.id}` : "/theme-settings", { method: item.id ? "PUT" : "POST", body: item }),
  unpublishThemeSetting: (id) => api(`/theme-settings/${id}`, { method: "DELETE" }),
  listNavigationItems: () => api("/navigation-items"),
  saveNavigationItem: (item) => api(item.id ? `/navigation-items/${item.id}` : "/navigation-items", { method: item.id ? "PUT" : "POST", body: item }),
  hideNavigationItem: (id) => api(`/navigation-items/${id}`, { method: "DELETE" }),
  settingVersions: (params = "") => api(`/setting-versions${params}`),
  restoreSettingVersion: (id) => api(`/setting-versions/${id}/restore`, { method: "POST" }),
  contentVersions: (params = "") => api(`/content-versions${params}`),
  restoreContentVersion: (id) => api(`/content-versions/${id}/restore`, { method: "POST" }),
  mediaAssets: (params = "") => api(`/media-assets${params}`),
  rescanMediaAssets: () => api("/media-assets/rescan", { method: "POST" }),
  deleteMediaAsset: (id, purge = false) => api(`/media-assets/${id}${purge ? "?purge=1" : ""}`, { method: "DELETE" }),
  searchSyncJobs: () => api("/search-sync-jobs"),
  backupJobs: () => api("/backup-jobs"),
  createBackupJob: (body) => api("/backup-jobs", { method: "POST", body }),
  restoreBackupJob: (id, body = {}) => api(`/backup-jobs/${id}/restore`, { method: "POST", body }),
  backupDownloadUrl: (id) => `${base}/backup-jobs/${id}/download`,
  auditLogs: (params = "") => api(`/audit-logs${params}`)
};
