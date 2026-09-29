/** Serializable pin data the server hands to the Vybe Map. */
export type MapVenue = {
  id: string; // location id
  businessSlug: string;
  name: string;
  kind: string;
  priceLevel: number | null;
  logoUrl: string | null;
  isDemo: boolean;
  approved: boolean; // VYBR8 Approved: the owner claimed it
  x: number;
  y: number;
  lat: number;
  lng: number;
  openNow: boolean | null; // null = hours unknown
  photo: { src: string; alt: string; rating: number | null; postId: string; isAlcoholic: boolean } | null;
};

export type MapLinkup = {
  id: string;
  title: string;
  occasion: string;
  when: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  spotsLeft: number;
  capacity: number;
  isAlcoholic: boolean;
  openToNewFriends: boolean;
  venueName: string | null;
};

export type MapFriend = {
  userId: string;
  username: string;
  name: string;
  intent: "eat" | "drink" | "link_up";
  note: string | null;
  venueName: string | null;
  x: number | null; // null when not at a listed place (shown in the side list only)
  y: number | null;
  lat: number | null;
  lng: number | null;
};

/** A food truck that is here right now (checked in with WE'RE HERE, or at an open stop in its window). */
export type MapTruck = {
  id: string; // business id
  slug: string;
  name: string;
  cuisine: string | null;
  x: number;
  y: number;
  lat: number;
  lng: number;
  live: boolean;
  until: string | null; // "9:00 PM" in city time
  where: string; // stop name or live note
};

export type MapData = {
  city: {
    slug: string;
    name: string;
    region: string;
    center: { lat: number; lng: number };
    bounds: { north: number; south: number; east: number; west: number };
  };
  venues: MapVenue[];
  linkups: MapLinkup[];
  friends: MapFriend[];
  trucks: MapTruck[];
  myStatus: { intent: "eat" | "drink" | "link_up"; note: string | null; expiresAt: string } | null;
};
