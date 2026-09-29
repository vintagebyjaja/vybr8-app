import type { CreatorType, PostKind } from "./posts.ts";

/** A post ready to render: photos already resolved to viewable URLs. */
export type FeedPost = {
  id: string;
  kind: PostKind;
  itemName: string | null;
  caption: string | null;
  rating: number | null;
  priceCents: number | null;
  visibility: "public" | "friends" | "private";
  status: "published" | "hidden" | "removed";
  isAlcoholic: boolean;
  isDemo: boolean;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    creatorType: CreatorType | null;
    teamTitle: string | null;
  };
  business: { slug: string; name: string } | null;
  photos: { src: string; width: number; height: number; alt: string }[];
  vybeCount: number;
  commentCount: number;
  viewerVybed: boolean;
};

export type FeedPage = { posts: FeedPost[]; nextCursor: string | null };

/** A creator application as the VYBR8 Team reviews it. */
export type PendingApplication = {
  id: string;
  creatorType: CreatorType;
  city: string | null;
  pitch: string;
  links: { platform?: string; url: string }[];
  /** Code the applicant puts in their Instagram/TikTok/YouTube bio or a post, so the team can confirm they own it. */
  proofCode: string;
  proofConfirmed: boolean;
  is21PlusAttested: boolean;
  createdAt: string;
  applicant: { id: string; username: string; displayName: string | null; postCount: number };
};
