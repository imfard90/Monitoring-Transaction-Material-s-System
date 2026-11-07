import { sql, type Kysely } from 'kysely';
import { db } from '@/lib/db/db';
import type { DB, LensaAccount } from '@/lib/db/database.types';

/**
 * Repository for `auth.user` reads/writes.
 *
 * Server actions must not issue raw `sql` templates against the auth schema
 * (AGENTS.md §1.3). This repository centralises the few queries the app needs
 * against `auth.user` outside Better Auth's own API.
 */
export interface UserRepository {
    getLensaAccountByUserId(userId: string): Promise<LensaAccount | null>;
    setLensaAccountByUserId(userId: string, account: LensaAccount | null): Promise<void>;
    getUserIdByNik(nik: string): Promise<string | null>;
    clearApiKeyByUserId(userId: string): Promise<void>;
}

export function createUserRepository(db: Kysely<DB>): UserRepository {
    return {
        async getLensaAccountByUserId(userId) {
            const row = await db
                .selectFrom('auth.user')
                .select(sql<LensaAccount | null>`lensa_acount`.as('lensa_acount'))
                .where('id', '=', userId)
                .executeTakeFirst();
            return row?.lensa_acount ?? null;
        },

        async setLensaAccountByUserId(userId, account) {
            await db
                .updateTable('auth.user')
                .set({
                    lensa_acount: account
                        ? sql<LensaAccount>`CAST(${JSON.stringify(account)} AS JSONB)`
                        : null,
                })
                .where('id', '=', userId)
                .execute();
        },

        async getUserIdByNik(nik) {
            const row = await db
                .selectFrom('auth.user')
                .select('id')
                .where('nik', '=', nik)
                .executeTakeFirst();
            return row?.id ?? null;
        },

        async clearApiKeyByUserId(userId) {
            await db
                .updateTable('auth.user')
                .set({ api_key: null, appr_api: false })
                .where('id', '=', userId)
                .execute();
        },
    };
}

/**
 * Singleton repository instance bound to the default database connection.
 */
export const userRepository = createUserRepository(db);
