import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // NetworkOS is the homepage: one self-contained page in public/. The old Lanyard landing lives at /lanyard.
  async rewrites() {
    return [
      { source: "/", destination: "/networkos.html" },
      { source: "/networkos", destination: "/networkos.html" },
    ]
  },
}

export default nextConfig
