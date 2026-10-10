import { withSerwist } from '@serwist/turbopack';

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: { unoptimized: true },
};

export default withSerwist(nextConfig);
