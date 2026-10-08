import { ConvexClient } from 'convex/browser';

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
let client: ConvexClient | null = null;

/** True when the build knows a Convex deployment (set by `npx convex dev` in .env.local). */
export function isOnlineConfigured(): boolean {
  return Boolean(url);
}

export function getConvexClient(): ConvexClient | null {
  if (!url) return null;
  client ??= new ConvexClient(url);
  return client;
}
