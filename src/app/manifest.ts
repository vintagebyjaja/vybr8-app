import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VYBR8",
    short_name: "VYBR8",
    description: "Eat • Drink • Link Up",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07060b",
    theme_color: "#07060b",
    categories: ["food", "lifestyle", "social"],
    icons: [
      { src: "/icons/icon-192.png?v=4", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=4", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
