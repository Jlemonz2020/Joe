import axios from "axios";
import type {
  AdminUser,
  CommentItem,
  FooterSection,
  MomentItem,
  OverviewPayload,
  PostItem,
  ProjectItem,
  SiteTextsPayload,
  UploadImagePayload
} from "./types";

export const http = axios.create({
  baseURL: "/admin/api",
  withCredentials: true,
  timeout: 15000
});

export function messageFromError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    return data?.message || data?.error || error.message;
  }
  return error instanceof Error ? error.message : "请求失败";
}

export const adminApi = {
  async login(payload: { username: string; password: string }) {
    const { data } = await http.post<{ user: AdminUser }>("/login", payload);
    return data.user;
  },
  async logout() {
    await http.post("/logout");
  },
  async me() {
    const { data } = await http.get<{ user: AdminUser }>("/me");
    return data.user;
  },
  async overview() {
    const { data } = await http.get<OverviewPayload>("/overview");
    return data;
  },
  async syncSearch() {
    const { data } = await http.post<{ count: number }>("/sync-search");
    return data;
  },
  async uploadImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    const { data } = await http.post<UploadImagePayload>("/uploads", form, {
      timeout: 30000
    });
    return data;
  },
  async listPosts(params?: { status?: string; q?: string }) {
    const { data } = await http.get<{ items: PostItem[] }>("/posts", { params });
    return data.items;
  },
  async getPost(id: string | number) {
    const { data } = await http.get<PostItem>(`/posts/${id}`);
    return data;
  },
  async savePost(payload: Partial<PostItem>) {
    const { data } = payload.id
      ? await http.put<PostItem>(`/posts/${payload.id}`, payload)
      : await http.post<PostItem>("/posts", payload);
    return data;
  },
  async hidePost(id: number) {
    await http.post(`/posts/${id}/hide`);
  },
  async destroyPost(id: number) {
    await http.delete(`/posts/${id}`);
  },
  async listMoments(params?: { status?: string; kind?: string }) {
    const { data } = await http.get<{ items: MomentItem[] }>("/moments", { params });
    return data.items;
  },
  async saveMoment(payload: Partial<MomentItem> & { tagText?: string }) {
    const { data } = payload.id
      ? await http.put<MomentItem>(`/moments/${payload.id}`, payload)
      : await http.post<MomentItem>("/moments", payload);
    return data;
  },
  async hideMoment(id: number) {
    await http.post(`/moments/${id}/hide`);
  },
  async destroyMoment(id: number) {
    await http.delete(`/moments/${id}`);
  },
  async listProjects(params?: { status?: string; q?: string }) {
    const { data } = await http.get<{ items: ProjectItem[] }>("/projects", { params });
    return data.items;
  },
  async getProject(id: string | number) {
    const { data } = await http.get<ProjectItem>(`/projects/${id}`);
    return data;
  },
  async saveProject(payload: Partial<ProjectItem>) {
    const { data } = payload.id
      ? await http.put<ProjectItem>(`/projects/${payload.id}`, payload)
      : await http.post<ProjectItem>("/projects", payload);
    return data;
  },
  async hideProject(id: number) {
    await http.post(`/projects/${id}/hide`);
  },
  async destroyProject(id: number) {
    await http.delete(`/projects/${id}`);
  },
  async listComments(params?: { status?: string; target?: string; q?: string }) {
    const { data } = await http.get<{ items: CommentItem[] }>("/comments", { params });
    return data.items;
  },
  async publishComment(id: number) {
    await http.post(`/comments/${id}/publish`);
  },
  async hideComment(id: number) {
    await http.post(`/comments/${id}/hide`);
  },
  async destroyComment(id: number) {
    await http.delete(`/comments/${id}`);
  },
  async getSiteTexts() {
    const { data } = await http.get<SiteTextsPayload>("/site-texts");
    return data;
  },
  async saveSiteTexts(payload: { texts: Record<string, string>; rules: string; footerSections: FooterSection[] }) {
    const { data } = await http.put<SiteTextsPayload>("/site-texts", payload);
    return data;
  },
  async getSettings() {
    const { data } = await http.get<{ githubUsername: string }>("/settings");
    return data;
  },
  async saveSettings(payload: { githubUsername: string }) {
    const { data } = await http.put<{ githubUsername: string }>("/settings", payload);
    return data;
  }
};
