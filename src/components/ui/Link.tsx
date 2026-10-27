import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * VYBR8's link. Same as next/link, except it doesn't prefetch every link on screen in the background.
 * Pages like What Should I Eat? show 200+ links, and each prefetch is a server request on Cloudflare.
 * Pages still load fast on tap; pass prefetch={true} for the rare link worth warming up.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
