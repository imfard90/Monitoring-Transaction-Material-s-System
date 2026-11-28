'use client';

import type React from 'react';
import { useAuthPermissions } from './SessionPermissionProvider';

export interface PermissionGateProps {
    /** Permission key yang dibutuhkan, misal 'rekon:unlock' atau 'stock_opname:approve' */
    permission: string;
    /** Opsional: bila diisi, mengecek cakupan wilayah untuk aksi approval/transaksi */
    warehouseId?: number | null;
    /** Opsional: bila diisi, menegakkan Segregation of Duties (user.nik !== requesterNik) */
    requesterNik?: string | null;
    /** Konten pengganti bila tidak memiliki izin (default: null / disembunyikan) */
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * UI Defense-in-Depth Guard untuk tombol aksi & komponen sensitif.
 * Tetap wajib dibarengi validasi Server Action dengan requirePermission().
 */
export function PermissionGate({
    permission,
    warehouseId,
    requesterNik,
    fallback = null,
    children,
}: PermissionGateProps) {
    const { can, canApprove } = useAuthPermissions();

    const allowed =
        warehouseId !== undefined || requesterNik !== undefined
            ? canApprove({ permissionKey: permission, warehouseId, requesterNik })
            : can(permission);

    if (!allowed) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
