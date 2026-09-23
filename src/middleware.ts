import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
    const isAuthRoute = request.nextUrl.pathname.startsWith('/auth');
    const isApiRoute = request.nextUrl.pathname.startsWith('/api');
    const isPublicStaticRoute = request.nextUrl.pathname.match(/\.(.*)$/);

    // Jangan intercept API dan static assets
    if (isApiRoute || isPublicStaticRoute) {
        return NextResponse.next();
    }

    // Bypass SSL Error (ERR_SSL_WRONG_VERSION_NUMBER) di Edge Runtime
    // Menggunakan fetch manual ke alamat loopback HTTP server lokal
    const port = process.env.PORT || 8000;
    const baseUrl = process.env.NODE_ENV === 'production' 
        ? `http://127.0.0.1:${port}` 
        : request.nextUrl.origin;
    
    let sessionData = null;
    try {
        const res = await fetch(`${baseUrl}/api/auth/get-session`, {
            headers: {
                cookie: request.headers.get('cookie') || '',
            },
        });
        if (res.ok) {
            sessionData = await res.json();
        }
    } catch (e) {
        console.error("Middleware fetch session error:", e);
    }

    // Jika belum login dan mencoba mengakses route selain auth (misal '/')
    if (!sessionData) {
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
