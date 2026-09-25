'use server';

import { db } from '@/lib/db/db';

export async function precheckLogin(email: string) {
    try {
        const user = await db
            .selectFrom('auth.user')
            .select(['id', 'is_active'])
            .where('email', '=', email)
            .executeTakeFirst();

        if (!user) {
            return { status: 'not_found' };
        }

        if (user.is_active !== true) {
            return { status: 'inactive' };
        }

        return { status: 'ok' };
    } catch (error) {
        console.error('Error prechecking login:', error);
        return { status: 'error' };
    }
}
