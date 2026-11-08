import type { NextConfig } from "next";

// GITHUB_PAGES=true builds a static copy of the dashboard for GitHub Pages (no API: it runs on the
// bundled sample review). NEXT_PUBLIC_BASE_PATH is the repository sub-path, e.g. /since-ai-26.
const pages = process.env.GITHUB_PAGES === "true";
const basePath = pages ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(pages ? { output: "export" as const, basePath, trailingSlash: true, images: { unoptimized: true } } : {}),
};

export default nextConfig;
