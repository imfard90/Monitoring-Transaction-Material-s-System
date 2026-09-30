import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getProfileData } from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { rateLimit } from '@/lib/security/rate-limit';
import { scrapeReservation } from '../../../../.external_scrapping/lensa-scraper';

const SECRET_KEY = process.env.MFA_ENCRYPTION_SECRET?.slice(0, 32) as string;
if (!SECRET_KEY) {
    throw new Error('Critical Configuration Error: MFA_ENCRYPTION_SECRET is not set.');
}

function decrypt(hash: string) {
    const parts = hash.split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted format');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SECRET_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const { success } = await rateLimit(`scrape:${ip}`, 10, 60); // 10 requests per 60 seconds
    if (!success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    if (!id) {
        return NextResponse.json(
            { error: 'Reservation ID (id) query parameter is required' },
            { status: 400 }
        );
    }

    try {
        const profile = await getProfileData();
        let customUsername = '';
        let customPassword = '';

        if (profile.success && profile.data?.lensa_acount) {
            customUsername = profile.data.lensa_acount.username;
            try {
                customPassword = decrypt(profile.data.lensa_acount.password);
            } catch (e) {
                console.error('Failed to decrypt Lensa password from database:', e);
                return NextResponse.json(
                    {
                        error: 'Gagal mendekripsi kredensial Lensa. Silakan hubungkan ulang akun Anda.',
                    },
                    { status: 401 }
                );
            }
        } else {
            return NextResponse.json(
                {
                    error: 'Akun Lensa belum terhubung. Silakan hubungkan akun Lensa Anda di menu User Profile.',
                },
                { status: 401 }
            );
        }

        const data = await scrapeReservation(id, customUsername, customPassword);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in scrape-reservation API:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to scrape reservation data' },
            { status: 500 }
        );
    }
}
