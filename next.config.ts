import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'prmfmmrzhnlltzyxxyhw.supabase.co', // 1. Supabase Storage
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com', // 2. UI Avatars
        port: '',
        pathname: '/api/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // 3. Google Auth Profile Pictures
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
