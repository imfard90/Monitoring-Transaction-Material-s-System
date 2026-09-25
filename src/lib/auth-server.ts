import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/db';

/**
 * Helper untuk mengambil NIK pengguna dari session auth di Server Actions.
 * Akan melempar Error 'Unauthorized' jika sesi tidak valid.
 */
export async function getSessionNik(): Promise<string> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        const nik = (session?.user as any)?.nik;
        if (!nik) {
            throw new Error('Unauthorized');
        }
        return nik;
    } catch (e: any) {
        if (e.message === 'Unauthorized') throw e;
        throw new Error('Unauthorized');
    }
}

export interface SessionUser {
    nik: string;
    role: string | null;
    /** Daftar warehouse_id yang dapat diakses user. Kosong = akses semua. */
    warehouseIds: number[];
    /** True jika user adalah Staff dan harus difilter berdasarkan WH. */
    isStaff: boolean;
    branchId: number | null;
    branchName: string | null;
}

/**
 * Helper untuk mengambil data user lengkap dari session (nik, role, warehouseIds).
 * Role di-query live dari hr.employees → hr.levels.
 * Untuk Staff, warehouse_ids di-query dari inventory.mas_wh berdasarkan pic_1/pic_2 = nik.
 * Non-staff = akses semua data (warehouseIds kosong, isStaff false).
 * Akan melempar Error 'Unauthorized' jika sesi tidak valid.
 */
export async function getSessionUser(): Promise<SessionUser> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        const user = session?.user as any;
        const nik: string = user?.nik;

        if (!nik) {
            throw new Error('Unauthorized');
        }

        // Query role from hr.employees → hr.levels
        const employee = await db
            .selectFrom('hr.employees as e')
            .leftJoin('hr.levels as l', 'l.id', 'e.level_id')
            .leftJoin('hr.branches as b', 'b.id', 'e.branch_id')
            .select(['l.level_name', 'e.branch_id', 'b.branch as branch_name'])
            .where('e.nik', '=', nik)
            .executeTakeFirst();

        const role = employee?.level_name ?? null;
        const branchId = employee?.branch_id ?? null;
        const branchName = employee?.branch_name ?? null;

        // For Staff: resolve warehouse_ids from mas_wh where pic_1 or pic_2 = nik
        let warehouseIds: number[] = [];
        if (role === 'Staff') {
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select('id')
                .where((eb) => eb.or([eb('pic_1', '=', nik), eb('pic_2', '=', nik)]))
                .execute();
            warehouseIds = whs.map((w) => w.id);
        }

        return {
            nik,
            role,
            warehouseIds,
            isStaff: role === 'Staff',
            branchId,
            branchName,
        };
    } catch (e: any) {
        if (e.message === 'Unauthorized') throw e;
        console.error('getSessionUser Error:', e);
        throw new Error('Unauthorized');
    }
}
