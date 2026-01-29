import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'prmfmmrzhnlltzyxxyhw.supabase.co', // Domain Project Supabase Anda
        port: '',
        pathname: '/storage/v1/object/public/**', // Izinkan akses ke bucket public
      },
    ],
  },
};

export default nextConfig;
