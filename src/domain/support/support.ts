/** Help & support: topics people write in about, and the Help center's answers. Pure data. */

export const SUPPORT_EMAIL = "support@vybr8.live";

export const SUPPORT_TOPICS = [
  { key: "sign_in", label: "Can't sign in / email not arriving" },
  { key: "account", label: "My account or profile" },
  { key: "business", label: "My restaurant, bar or food truck" },
  { key: "claim", label: "Claiming a place or chef profile" },
  { key: "max", label: "VYBR8+ / VYBR8 MAX" },
  { key: "bug", label: "Something's broken" },
  { key: "idea", label: "Idea or feedback" },
  { key: "safety", label: "Report someone or something unsafe" },
  { key: "privacy", label: "Privacy or deleting my data" },
  { key: "other", label: "Something else" },
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["key"];
export const topicLabel = (k: string) => SUPPORT_TOPICS.find((t) => t.key === k)?.label ?? "Something else";

export type Faq = { q: string; a: string; link?: { href: string; label: string } };
export const FAQ: { title: string; items: Faq[] }[] = [
  {
    title: "Getting started",
    items: [
      { q: "What is VYBR8?", a: "VYBR8 is where you find what to eat and drink, rate the dishes and drinks you actually had, and link up with friends. Charts are built from real ratings, so the people decide what's best, never paid placement." },
      { q: "I didn't get my confirmation email.", a: "Check spam and promotions first, and search for \"VYBR8\". Still nothing after 10 minutes? Try signing in again to resend it, or send us a message below with the email you used and we'll help." },
      { q: "Why do you need my birthday?", a: "VYBR8 is 13+. Your birthday also unlocks Birthday Perks, and drink posts and drink perks only show for people 21 and up. Your birth year is never shown to anyone." },
      { q: "How do I add a profile picture?", a: "Go to your profile, open Settings and tap your photo to upload a new one.", link: { href: "/profile/settings", label: "Profile settings" } },
    ],
  },
  {
    title: "Places, ratings & Charts",
    items: [
      { q: "A place is missing. Can I add it?", a: "Yes. Add it with its address and our team reviews it, usually within a day. Chains are added location by location, so every branch has its own ratings.", link: { href: "/places/new", label: "Add a place" } },
      { q: "Where does place info come from?", a: "Places are added by people on VYBR8, by owners who claim them, and from OpenStreetMap (© OpenStreetMap contributors), a free map anyone can improve. Ratings, posts and Charts come only from people on VYBR8." },
      { q: "How do the Charts work?", a: "The VYBR8 25 and every chart rank dishes, drinks, places and chefs by what people rated them, in each city. Businesses can't pay to move up." },
      { q: "What does \"VYBR8 Approved\" mean?", a: "The owner or manager proved the place is theirs and keeps its menu and hours up to date on VYBR8. It isn't a paid ranking boost." },
    ],
  },
  {
    title: "For businesses & chefs",
    items: [
      { q: "How do I claim my restaurant, bar or food truck?", a: "Open your place on VYBR8 and tap \"Claim it\". Prove it's yours with a business email, a call to the business line, your Google Business Profile, a code on your website or socials, or a document. Franchise owners claim each location separately." },
      { q: "How do I claim my chef profile?", a: "Open your chef profile and tap \"Claim this chef profile\". Link your socials or website, or upload proof, and our team verifies it." },
      { q: "Can I pay to rank higher?", a: "No. Charts and ratings can't be bought. Businesses can post updates, menus, perks and events to reach more people." },
    ],
  },
  {
    title: "Active Vybe & privacy",
    items: [
      { q: "Who can see my sleep, check-ins and food log?", a: "Only you. Not friends, not businesses, not the VYBR8 Team. VYBR8 gives wellness information, not medical advice." },
      { q: "I work nights. Does Active Vybe work for me?", a: "Yes. Set when you usually wake up and go to bed in My Vybe Schedule, and your morning, midday and night check-ins follow your day.", link: { href: "/health/schedule", label: "My Vybe Schedule" } },
      { q: "How do I delete my account or my data?", a: "Send us a message below with the topic \"Privacy or deleting my data\" from the email on your account, and we'll take care of it." },
    ],
  },
  {
    title: "Safety",
    items: [
      { q: "Someone is being inappropriate or unsafe.", a: "Use \"Report this post\" on the post, or send us a message below with the topic \"Report someone or something unsafe\". If anyone is in immediate danger, call 911 first." },
      { q: "Meeting people from Link Ups", a: "Meet in public places, tell a friend where you're going, and leave whenever you want to. Public Link Ups are 18+." },
    ],
  },
];
