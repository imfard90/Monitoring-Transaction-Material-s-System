import { type NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
    const isAuthRoute = request.nextUrl.pathname.startsWith('/auth');
    const isApiRoute = request.nextUrl.pathname.startsWith('/api');
    const isPublicStaticRoute = request.nextUrl.pathname.match(/\.(.*)$/);

    // Jangan intercept API dan static assets
    if (isApiRoute || isPublicStaticRoute) {
        return NextResponse.next();
    }

    // Periksa keberadaan cookie sesi (mengabaikan SSL/fetch loopback error)
    // Nama cookie dari Better Auth biasanya 'better-auth.session_token' atau versi Secure-nya
    const hasSessionCookie = 
        request.cookies.has('better-auth.session_token') || 
        request.cookies.has('__Secure-better-auth.session_token');

    // Jika belum login dan mencoba mengakses route selain auth (misal '/')
    if (!hasSessionCookie) {
        if (!isAuthRoute) {
            return NextResponse.redirect(new URL('/auth/login', request.url));
        }
        return NextResponse.next();
    }

    // Jika sudah login tapi mencoba mengakses route auth (misal '/auth/login')
    if (isAuthRoute) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

export const config = {
    // Hanya jalankan middleware untuk root (/) dan seluruh route selain assets (favicon, images, dsb)
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
