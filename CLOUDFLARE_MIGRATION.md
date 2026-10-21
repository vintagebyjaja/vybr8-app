# Cloudflare Workers migration

This is a migration preparation branch, not a verified production deployment.

1. Run `npm install` with Node 22+ and commit the updated `package-lock.json` before using `npm ci`.
2. Run `npm run typecheck`, `npm run build`, then `npm run cloudflare:build` and `npm run cloudflare:preview`.
3. Configure the Cloudflare Worker build command `npm run cloudflare:build` and deploy command `npx wrangler deploy` (or connect GitHub to Workers Builds).
4. Add existing Supabase public URL/anon key and server-only secrets in Cloudflare environment settings. Never commit credentials.
5. Update Supabase Auth site URL and redirect allowlist for the Cloudflare preview and custom domain; retain Netlify URLs until cutover.
6. Test sign-in/out, session cookies, API routes, uploads, server actions and third-party integrations before changing DNS or retiring Netlify.

Cloudflare Workers uses OpenNext, not static Pages output. Next.js version and Node-only libraries must be validated against the installed adapter. PATHD PDF/DOCX parsing especially needs runtime testing. Existing Netlify configuration is intentionally retained until cutover.
Cloudflare deployment trigger
