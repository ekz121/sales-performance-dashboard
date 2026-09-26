import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  images: {
    // Aplikasi lokal hanya memakai logo PNG kecil. Menyajikannya langsung
    // membuat logo tetap tampil tanpa bergantung pada proses image optimizer.
    unoptimized: true,
  },
};

export default nextConfig;
