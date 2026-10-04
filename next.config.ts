import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Teachers upload PDF/Word/text files (up to 8 MB) through a server action.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // Parsers that load their own files at runtime stay outside the bundle.
  serverExternalPackages: ["mammoth", "unpdf"],
};

export default nextConfig;
