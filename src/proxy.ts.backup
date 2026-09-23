import { betterFetch } from '@better-fetch/fetch';
import { type NextRequest, NextResponse } from 'next/server';

type SessionResponse = {
    session: {
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        expiresAt: string;
    };
    user: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        nik: string;
        is_active: boolean | null;
    };
};

export async function proxy(request: NextRequest) {
    const isAuthRoute = request.nextUrl.pathname.startsWith('/auth');
    const isApiRoute = request.nextUrl.pathname.startsWith('/api');
    const isPublicStaticRoute = request.nextUrl.pathname.match(/\.(.*)$/);

    // Jangan intercept request ke API atau assets statis
    if (isApiRoute || isPublicStaticRoute) {
        return NextResponse.next();
    }

    const { data: sessionData } = await betterFetch<SessionResponse>('/api/auth/get-session', {
        baseURL: request.nextUrl.origin,
        headers: {
            cookie: request.headers.get('cookie') || '',
        },
    });

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
