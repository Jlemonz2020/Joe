export interface AdminUser {
  id: number;
  username: string;
}

export interface OverviewStats {
  posts: number;
  publishedPosts: number;
  draftPosts: number;
  moments: number;
  projects: number;
  activeProjects: number;
  comments: number;
}

export interface OverviewPayload {
  stats: OverviewStats;
  recentPosts: PostItem[];
  recentProjects: ProjectItem[];
  recentMoments: MomentItem[];
}

export interface PostItem {
  id: number;
  title: string;
  slug: string;
  summary: string;
  content_md?: string;
  cover_url?: string;
  status: "draft" | "published";
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface MomentItem {
  id: number;
  content: string;
  kind: "project" | "life" | "tech";
  tags: string[];
  image_url?: string;
  status: "draft" | "published";
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CommentItem {
  id: number;
  target: string;
  author_name: string;
  author_email?: string;
  content: string;
  status: "pending" | "published" | "hidden";
  likes: number;
  created_at?: string | null;
}

export interface ProjectItem {
  id: number;
  name: string;
  slug: string;
  summary: string;
  status_text: string;
  progress: number;
  last_update?: string;
  status: "active" | "archived";
  sort_order: number;
  cover_url?: string;
  content_md?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FooterLink {
  label: string;
  href: string;
  desc: string;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export interface TextDefinition {
  group: string;
  key: string;
  label: string;
  defaultValue: string;
}

export interface SiteTextsPayload {
  definitions: TextDefinition[];
  texts: Record<string, string>;
  rules: string;
  footerSections: FooterSection[];
  layout?: FrontendLayout;
}

export interface UploadImagePayload {
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface FrontendLayout {
  home: {
    width: "narrow" | "balanced" | "wide";
    density: "compact" | "comfortable" | "airy";
    projectPreviewLimit: number;
    momentPreviewLimit: number;
    showStatusStrip: boolean;
    showProjectPreview: boolean;
    showMomentPreview: boolean;
    showProfileCard: boolean;
    showStatsCard: boolean;
    showCategoryCard: boolean;
  };
  archive: {
    defaultCategory: "" | "linux" | "raspberry-pi" | "server" | "life";
    showSearchPanel: boolean;
    showGithubPanel: boolean;
  };
  moments: {
    defaultKind: "all" | "project" | "life" | "tech";
    showDraftPanel: boolean;
  };
  projects: {
    cardStyle: "cover" | "compact" | "minimal";
    showRoadmap: boolean;
    showMaintain: boolean;
  };
  footer: {
    motion: "candles" | "loader" | "both" | "none";
  };
}

export interface FrontendLayoutPayload {
  layout: FrontendLayout;
}
