import { defineStore } from "pinia";
import { adminApi } from "@/api";
import type { AdminUser } from "@/types";

export const useSessionStore = defineStore("session", {
  state: () => ({
    user: null as AdminUser | null,
    booted: false
  }),
  getters: {
    isAuthed: (state) => Boolean(state.user)
  },
  actions: {
    async boot() {
      if (this.booted) return;
      try {
        this.user = await adminApi.me();
      } catch {
        this.user = null;
      } finally {
        this.booted = true;
      }
    },
    async login(username: string, password: string) {
      this.user = await adminApi.login({ username, password });
      this.booted = true;
    },
    async logout() {
      await adminApi.logout();
      this.user = null;
      this.booted = true;
    }
  }
});
