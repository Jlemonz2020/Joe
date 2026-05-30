import { createRouter, createWebHistory } from "vue-router";
import { useSessionStore } from "@/stores/session";

export const router = createRouter({
  history: createWebHistory("/admin/"),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { public: true }
    },
    {
      path: "/",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
      meta: { title: "概览" }
    },
    {
      path: "/posts",
      name: "posts",
      component: () => import("@/views/PostsView.vue"),
      meta: { title: "文章" }
    },
    {
      path: "/posts/new",
      name: "post-new",
      component: () => import("@/views/PostEditorView.vue"),
      meta: { title: "新文章" }
    },
    {
      path: "/posts/:id",
      name: "post-edit",
      component: () => import("@/views/PostEditorView.vue"),
      meta: { title: "编辑文章" }
    },
    {
      path: "/moments",
      name: "moments",
      component: () => import("@/views/MomentsView.vue"),
      meta: { title: "瞬间" }
    },
    {
      path: "/projects",
      name: "projects",
      component: () => import("@/views/ProjectsView.vue"),
      meta: { title: "项目" }
    },
    {
      path: "/comments",
      name: "comments",
      component: () => import("@/views/CommentsView.vue"),
      meta: { title: "留言" }
    },
    {
      path: "/projects/new",
      name: "project-new",
      component: () => import("@/views/ProjectEditorView.vue"),
      meta: { title: "新项目" }
    },
    {
      path: "/projects/:id",
      name: "project-edit",
      component: () => import("@/views/ProjectEditorView.vue"),
      meta: { title: "编辑项目" }
    },
    {
      path: "/texts",
      name: "texts",
      component: () => import("@/views/TextsView.vue"),
      meta: { title: "站点文案" }
    },
    {
      path: "/frontend-layout",
      name: "frontend-layout",
      component: () => import("@/views/FrontendLayoutView.vue"),
      meta: { title: "前台布局" }
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
      meta: { title: "设置" }
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/"
    }
  ]
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.boot();
  if (!to.meta.public && !session.isAuthed) return { name: "login", query: { redirect: to.fullPath } };
  if (to.name === "login" && session.isAuthed) return { name: "dashboard" };
  return true;
});
