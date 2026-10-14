import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';

function createReportOnlyCsp(nonce: string): string {
    const isDevelopment = process.env.NODE_ENV === 'development';
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com${isDevelopment ? " 'unsafe-eval'" : ''}`,
        `style-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://challenges.cloudflare.com",
        'frame-src https://challenges.cloudflare.com',
        'report-uri /api/csp-report',
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
    ].join('; ');
}

export async function proxy(request: NextRequest) {
    const isAuthRoute = request.nextUrl.pathname.startsWith('/auth');
    const isApiRoute = request.nextUrl.pathname.startsWith('/api');
    const isPublicStaticRoute = request.nextUrl.pathname.match(/\.(.*)$/);

    // CSP is applied to page requests only; APIs have their own response contracts.
    if (isApiRoute || isPublicStaticRoute) {
        return NextResponse.next();
    }

    const nonce = Buffer.from(randomUUID()).toString('base64');
    const csp = createReportOnlyCsp(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy-Report-Only', csp);

    const nextResponse = () => {
        const response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set('Content-Security-Policy-Report-Only', csp);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    };

    // Periksa keberadaan cookie sesi (mengabaikan SSL/fetch loopback error)
    // Nama cookie dari Better Auth biasanya 'better-auth.session_token' atau versi Secure-nya
    const hasSessionCookie =
        request.cookies.has('better-auth.session_token') ||
        request.cookies.has('__Secure-better-auth.session_token');

    // Jika belum login dan mencoba mengakses route selain auth (misal '/')
    if (!hasSessionCookie) {
        if (!isAuthRoute) {
            const response = NextResponse.redirect(new URL('/auth/login', request.url));
            response.headers.set('Content-Security-Policy-Report-Only', csp);
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
        }
        return nextResponse();
    }

    // Jika sudah login tapi mencoba mengakses route auth (misal '/auth/login')
    if (isAuthRoute) {
        const response = NextResponse.redirect(new URL('/', request.url));
        response.headers.set('Content-Security-Policy-Report-Only', csp);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    }

    return nextResponse();
}

export const config = {
    // Hanya jalankan middleware untuk root (/) dan seluruh route selain assets (favicon, images, dsb)
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
