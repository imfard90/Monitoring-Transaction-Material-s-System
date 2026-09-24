import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
    swSrc: 'src/sw.ts',
    swDest: 'public/sw.js',
    reloadOnOnline: true,
    disablePrecacheManifest: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    images: { unoptimized: true },
    turbopack: {},
};

export default withSerwist(nextConfig);
