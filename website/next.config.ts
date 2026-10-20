import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // The NetworkOS prototype is one self-contained page in public/; give it a clean URL.
  async rewrites() {
    return [{ source: "/networkos", destination: "/networkos.html" }]
  },
}

export default nextConfig
