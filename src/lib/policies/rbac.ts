export type RoleKey =
    | 'PEJABAT_AREA'
    | 'PEJABAT_REGIONAL'
    | 'PEJABAT_BRANCH'
    | 'TL_SA'
    | 'STAFF_GUDANG'
    | 'TEKNISI';

export interface ScopeBoundary {
    area: string | null;
    regional: string | null;
    branch: string | null;
    serviceArea: string | null;
}

export interface RbacUser {
    nik: string;
    email?: string | null;
    isSuperUser?: boolean;
    roleKey?: RoleKey | null;
    hierarchyLevel?: number;
    permissions?: readonly string[];
    warehouseIds?: readonly number[];
    scopeBoundary?: ScopeBoundary;
}

/**
 * Evaluasi SuperUser dari environment variables (server-only).
 * Mewajibkan kecocokan ganda (email dan NIK) agar tidak mudah di-spoof.
 */
export function isSuperUserFromEnv(
    email?: string | null,
    nik?: string | null,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    const expectedEmail = env.SUPERUSER_EMAIL?.trim().toLowerCase();
    const expectedNik = env.SUPERUSER_NIK?.trim();

    if (!expectedEmail || !expectedNik) return false;
    if (!email || !nik) return false;

    return email.trim().toLowerCase() === expectedEmail && nik.trim() === expectedNik;
}

/**
 * Mengecek apakah user memiliki permission tertentu.
 * SuperUser otomatis memiliki seluruh permission.
 */
export function hasPermission(user: RbacUser | null | undefined, permissionKey: string): boolean {
    if (!user) return false;
    if (user.isSuperUser) return true;
    const perms = user.permissions;
    if (!perms || perms.length === 0) return false;
    return perms.includes('*') || perms.includes(permissionKey);
}

/**
 * Mengevaluasi kelayakan user untuk melakukan Approval / Reject transaksi.
 * Menegakkan 3 lapis: Permission + Scope Wilayah + Segregation of Duties (SoD).
 */
export function canApproveTransaction(
    user: RbacUser | null | undefined,
    options: {
        permissionKey: string;
        warehouseId?: number | null;
        requesterNik?: string | null;
    }
): boolean {
    if (!user) return false;
    if (!hasPermission(user, options.permissionKey)) return false;
    if (user.isSuperUser) return true;

    // 1. Scope Wilayah: wajib mencakup gudang transaksi jika warehouseId diberikan
    if (options.warehouseId != null) {
        const allowed = user.warehouseIds ?? [];
        if (!allowed.includes(options.warehouseId)) {
            return false;
        }
    }

    // 2. Segregation of Duties (SoD): pembuat pengajuan tidak boleh approve sendiri
    if (options.requesterNik && user.nik.trim() === options.requesterNik.trim()) {
        return false;
    }

    return true;
}

/**
 * Mencegah privilege escalation: user non-SuperUser tidak boleh memberikan role
 * dengan hierarchyLevel lebih tinggi (angka lebih kecil) dari miliknya sendiri.
 */
export function canAssignRole(
    actor: RbacUser | null | undefined,
    targetHierarchyLevel: number
): boolean {
    if (!actor) return false;
    if (actor.isSuperUser) return true;
    if (!hasPermission(actor, 'users:manage')) return false;

    const actorLevel = actor.hierarchyLevel ?? 99;
    return actorLevel <= targetHierarchyLevel;
}
