import type { NextConfig } from "next";
import { LEGACY_POSTS } from "./lib/legacy";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  cacheComponents: true,
  // Links into the old site at tom-sherman.com, which redirects here.
  redirects: async () => [
    ...Object.entries(LEGACY_POSTS).map(([slug, destination]) => ({
      source: `/blog/${slug}`,
      destination,
      permanent: true,
    })),
    // There are no tag pages here.
    { source: "/blog/tags/:tag", destination: "/blog", permanent: false },
    { source: "/resume", destination: "/CV.pdf", permanent: false },
  ],
};

export default nextConfig;
