import { withSerwist } from '@serwist/turbopack';

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async redirects() {
        return [
            { source: '/apps/out-sap', destination: '/form/out-sap', permanent: true },
            { source: '/apps/rekon-intech', destination: '/form/rekon-intech', permanent: true },
            { source: '/apps/rekon-lensa', destination: '/form/rekon-lensa', permanent: true },
            {
                source: '/apps/return-material',
                destination: '/form/return-material',
                permanent: true,
            },
            {
                source: '/user-profile',
                destination: '/management/user-profile',
                permanent: true,
            },
        ];
    },
    async headers() {
        const securityHeaders = [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            {
                key: 'Permissions-Policy',
                value: 'camera=(), microphone=(), geolocation=()',
            },
            ...(process.env.NODE_ENV === 'production'
                ? [
                      {
                          key: 'Strict-Transport-Security',
                          value: 'max-age=31536000; includeSubDomains',
                      },
                  ]
                : []),
        ];

        return [
            {
                source: '/:path*',
                headers: securityHeaders,
            },
        ];
    },
    images: {
        unoptimized: true,
        contentDispositionType: 'attachment',
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
};

export default withSerwist(nextConfig);
