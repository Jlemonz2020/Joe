import type {
  CommentsResponse,
  GithubContributions,
  ListResponse,
  Moment,
  Post,
  Project,
  ReactionsResponse,
  SearchItem,
  SiteOverview,
  SiteTexts
} from "./types";

export const fallbackSiteTexts: SiteTexts = {
  texts: {},
  rules: [],
  footerSections: [],
  layout: {},
  ui: {}
};

export const fallbackOverview: SiteOverview = {
  stats: {
    posts: 0,
    moments: 0,
    projects: 0,
    categories: 0
  },
  latestMoments: []
};

export const fallbackMoments: ListResponse<Moment> = { items: [] };
export const fallbackPosts: ListResponse<Post> = { items: [] };
export const fallbackProjects: ListResponse<Project> = { items: [] };
export const fallbackSearch: ListResponse<SearchItem> = { items: [] };

export const fallbackComments = (target = "site-home"): CommentsResponse => ({
  target,
  items: []
});

export const fallbackReactions = (target = "site-home"): ReactionsResponse => ({
  target,
  likes: 0
});

export const fallbackGithubContributions: GithubContributions = {
  username: "Jlemonz2020",
  total: 0,
  days: []
};
