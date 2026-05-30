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
  destroyPost: (id) => api(`/posts/${id}`, { method: "DELETE" }),
  listMoments: () => api("/moments"),
  saveMoment: (item) => api(item.id ? `/moments/${item.id}` : "/moments", { method: item.id ? "PUT" : "POST", body: item }),
  hideMoment: (id) => api(`/moments/${id}/hide`, { method: "POST" }),
  destroyMoment: (id) => api(`/moments/${id}`, { method: "DELETE" }),
  listProjects: () => api("/projects"),
  getProject: (id) => api(`/projects/${id}`),
  saveProject: (item) => api(item.id ? `/projects/${item.id}` : "/projects", { method: item.id ? "PUT" : "POST", body: item }),
  hideProject: (id) => api(`/projects/${id}/hide`, { method: "POST" }),
  destroyProject: (id) => api(`/projects/${id}`, { method: "DELETE" }),
  listComments: () => api("/comments"),
  saveComment: (item) => api(`/comments/${item.id}`, { method: "PUT", body: item }),
  publishComment: (id) => api(`/comments/${id}/publish`, { method: "POST" }),
  hideComment: (id) => api(`/comments/${id}/hide`, { method: "POST" }),
  destroyComment: (id) => api(`/comments/${id}`, { method: "DELETE" }),
  getSiteTexts: () => api("/site-texts"),
  saveSiteTexts: (body) => api("/site-texts", { method: "PUT", body }),
  getFrontendEditor: () => api("/frontend-editor"),
  saveFrontendDraft: (payload) => api("/frontend-editor/draft", { method: "PUT", body: { payload } }),
  deleteFrontendDraft: () => api("/frontend-editor/draft", { method: "DELETE" }),
  publishFrontendEditor: (payload) => api("/frontend-editor/publish", { method: "POST", body: { payload } }),
  restoreFrontendEditor: () => api("/frontend-editor/restore", { method: "POST" }),
  getSettings: () => api("/settings"),
  saveSettings: (body) => api("/settings", { method: "PUT", body })
};
