import 'dotenv/config';
import { sql } from 'kysely';
import { db, pool } from '../src/lib/db/db';

const TELKOMAKSES_PROFILE_BASE_URL =
    process.env.TELKOMAKSES_PROFILE_URL || 'http://203.130.242.238:3006';

interface TelkomAksesProfileItem {
    nik?: string | null;
    name?: string | null;
    nama_posisi?: string | null;
    witel?: string | null;
    psa?: string | null;
    bizpart_id?: string | number | null;
    status?: string | null;
}

interface TelkomAksesProfileResponse {
    status?: boolean;
    message?: string;
    data?: TelkomAksesProfileItem[];
}

async function fetchTelkomAksesProfile(nik: string): Promise<TelkomAksesProfileItem | null> {
    const url = `${TELKOMAKSES_PROFILE_BASE_URL}/data_profile/${encodeURIComponent(nik)}/16`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} dari ${url}`);
    }

    const payload = (await res.json()) as TelkomAksesProfileResponse;
    const item = payload?.data?.[0];
    if (!item || item.status !== 'T') {
        return null;
    }
    return item;
}

async function resolveOrCreatePositionId(positionName?: string | null): Promise<number | null> {
    const clean = positionName?.trim();
    if (!clean) return null;

    const existing = await db
        .selectFrom('hr.positions')
        .select('id')
        .where(sql<boolean>`UPPER(TRIM(position_name)) = UPPER(TRIM(${clean}))`)
        .executeTakeFirst();

    if (existing) return existing.id;

    const inserted = await db
        .insertInto('hr.positions')
        .values({ position_name: clean })
        .returning('id')
        .executeTakeFirst();

    return inserted?.id ?? null;
}

async function resolveBranchId(psa?: string | null, witel?: string | null): Promise<number | null> {
    const cleanPsa = psa?.trim();
    const cleanWitel = witel?.trim().replace(/^BRANCH\s+/i, '');

    if (cleanPsa) {
        const bySa = await db
            .selectFrom('hr.branches')
            .select('id')
            .where(sql<boolean>`UPPER(TRIM(service_area)) = UPPER(TRIM(${cleanPsa}))`)
            .executeTakeFirst();
        if (bySa) return bySa.id;
    }

    if (cleanWitel) {
        const byBranch = await db
            .selectFrom('hr.branches')
            .select('id')
            .where(sql<boolean>`UPPER(TRIM(branch)) = UPPER(TRIM(${cleanWitel}))`)
            .executeTakeFirst();
        if (byBranch) return byBranch.id;
    }

    return null;
}

async function main() {
    const users = await db
        .selectFrom('auth.user')
        .select(['nik', 'name'])
        .where('nik', 'is not', null)
        .orderBy('nik', 'asc')
        .execute();

    const targetNiks = Array.from(
        new Set(users.map((u) => u.nik?.trim()).filter((n): n is string => Boolean(n)))
    );

    console.log(`Memulai sinkronisasi HR untuk ${targetNiks.length} NIK terdaftar...`);

    let updated = 0;
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const nik of targetNiks) {
        try {
            const profile = await fetchTelkomAksesProfile(nik);
            if (!profile) {
                console.log(`[SKIP] NIK ${nik}: tidak ditemukan / status != 'T' di HRMIS TA`);
                skipped++;
                continue;
            }

            const existingEmp = await db
                .selectFrom('hr.employees')
                .select(['id', 'nama', 'position_id', 'branch_id', 'bizpart_id', 'status'])
                .where('nik', '=', nik)
                .executeTakeFirst();

            const nextNama = profile.name?.trim() || existingEmp?.nama || null;
            const nextPositionId =
                (await resolveOrCreatePositionId(profile.nama_posisi)) ??
                existingEmp?.position_id ??
                null;
            const nextBranchId =
                (await resolveBranchId(profile.psa, profile.witel)) ??
                existingEmp?.branch_id ??
                null;

            const parsedBizpart = Number(profile.bizpart_id);
            const nextBizpartId =
                Number.isInteger(parsedBizpart) && parsedBizpart > 0
                    ? parsedBizpart
                    : (existingEmp?.bizpart_id ?? null);
            const nextStatus = profile.status === 'T' ? 'ACTIVE' : 'INACTIVE';

            if (existingEmp) {
                await db
                    .updateTable('hr.employees')
                    .set({
                        nama: nextNama,
                        position_id: nextPositionId,
                        branch_id: nextBranchId,
                        bizpart_id: nextBizpartId,
                        status: nextStatus,
                    })
                    .where('id', '=', existingEmp.id)
                    .execute();
                updated++;
                console.log(
                    `[UPDATED] NIK ${nik} | ${nextNama} | pos=${profile.nama_posisi ?? '-'} (${nextPositionId}) | branch_id=${nextBranchId} | bizpart=${nextBizpartId}`
                );
            } else {
                await db
                    .insertInto('hr.employees')
                    .values({
                        nik,
                        nama: nextNama,
                        position_id: nextPositionId,
                        branch_id: nextBranchId,
                        bizpart_id: nextBizpartId,
                        status: nextStatus,
                    })
                    .execute();
                inserted++;
                console.log(`[INSERTED] NIK ${nik} | ${nextNama}`);
            }
        } catch (err) {
            failed++;
            console.error(`[FAILED] NIK ${nik}:`, err instanceof Error ? err.message : String(err));
        }
    }

    console.log(
        `\nSelesai: updated=${updated}, inserted=${inserted}, skipped=${skipped}, failed=${failed}`
    );
    await pool.end();
    if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
    console.error('Fatal error:', err);
    await pool.end();
    process.exit(1);
});
