'use client';

import { motion } from 'framer-motion';
import { ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useAuthPermissions } from '@/components/auth/SessionPermissionProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { Switch } from '@/components/ui/switch';
import type { RoleKey } from '@/lib/policies/rbac';
import {
    createColumnHelper,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@/lib/table';
import type { ScopeHierarchyData } from './_components/UserScopeModal';
import {
    deleteUser,
    getUsers,
    resetUserMfa,
    saveUserScopeMappingAction,
    toggleUserApiApproval,
    toggleUserStatus,
} from './actions';

const UserDevicesDialog = dynamic(
    () => import('./_components/user-devices-dialog').then((mod) => mod.UserDevicesDialog),
    { ssr: false }
);

const UserScopeModal = dynamic(
    () => import('./_components/UserScopeModal').then((mod) => mod.UserScopeModal),
    { ssr: false }
);

export interface UserItem {
    id: string;
    name: string;
    email: string;
    nik: string;
    is_active: boolean | null;
    appr_api?: boolean | null;
    has_api_key: boolean | null;
    lensa_acount: Record<string, unknown>;
    role: string | null;
    is_online: boolean;
    twoFactorEnabled?: boolean;
    active_devices_count?: number;
    is_superuser?: boolean;
    rbac_role_key?: RoleKey | null;
    rbac_role_name?: string | null;
    rbac_hierarchy_level?: number;
    scope_area?: string | null;
    scope_regional?: string | null;
    scope_branch?: string | null;
    scope_service_area?: string | null;
    scope_warehouse_ids?: number[];
    scope_valid_until?: string | null;
    scope_summary?: string;
}

interface UserTableProps {
    data: UserItem[];
    hierarchy: ScopeHierarchyData;
}

const columnHelper = createColumnHelper<UserItem>();

export default function UserTable({ data, hierarchy }: UserTableProps) {
    const { can, isSuperUser, hierarchyLevel } = useAuthPermissions();
    const canManageUsers = can('users:manage');
    const [users, setUsers] = useState(data);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let isMounted = true;
        let isRefreshing = false;
        const refreshPresence = async () => {
            if (isRefreshing) return;
            isRefreshing = true;
            try {
                const latestUsers = await getUsers();
                if (isMounted)
                    setUsers((current) =>
                        current.map((user) => {
                            const latest = latestUsers.find(
                                (candidate) => candidate.id === user.id
                            );
                            return latest ? { ...user, is_online: latest.is_online } : user;
                        })
                    );
            } catch {
                // Keep the last known presence when a transient refresh fails.
            } finally {
                isRefreshing = false;
            }
        };

        const interval = window.setInterval(refreshPresence, 30_000);
        return () => {
            isMounted = false;
            window.clearInterval(interval);
        };
    }, []);
    const [nikFilter, setNikFilter] = useState('');
    const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
    const [userToResetMfa, setUserToResetMfa] = useState<UserItem | null>(null);
    const [selectedUserDevices, setSelectedUserDevices] = useState<UserItem | null>(null);
    const [selectedUserScope, setSelectedUserScope] = useState<UserItem | null>(null);

    const handleToggleStatus = (userId: string, currentStatus: boolean) => {
        startTransition(async () => {
            try {
                await toggleUserStatus(userId, !currentStatus);
                toast.success(`Status pengguna ${currentStatus ? 'dinonaktifkan' : 'diaktifkan'}`);
            } catch (error: unknown) {
                toast.error(
                    error instanceof Error ? error.message : 'Gagal memperbarui status pengguna'
                );
            }
        });
    };

    const handleToggleApiApproval = (userId: string, currentStatus: boolean) => {
        startTransition(async () => {
            try {
                await toggleUserApiApproval(userId, !currentStatus);
                toast.success(`Akses API ${currentStatus ? 'dicabut' : 'disetujui'}`);
            } catch (error: unknown) {
                toast.error(
                    error instanceof Error ? error.message : 'Gagal memperbarui approval API'
                );
            }
        });
    };

    const handleConfirmDelete = () => {
        if (!userToDelete) return;
        startTransition(async () => {
            try {
                await deleteUser(userToDelete.id);
                toast.success('Pengguna berhasil dihapus');
                setUserToDelete(null);
            } catch (error: unknown) {
                toast.error(error instanceof Error ? error.message : 'Gagal menghapus pengguna');
            }
        });
    };

    const handleConfirmResetMfa = () => {
        if (!userToResetMfa) return;
        startTransition(async () => {
            try {
                await resetUserMfa(userToResetMfa.id);
                toast.success(
                    `MFA & seluruh perangkat untuk "${userToResetMfa.name}" berhasil di-reset.`
                );
                setUserToResetMfa(null);
                const latest = await getUsers();
                setUsers(latest);
            } catch (error: unknown) {
                toast.error(error instanceof Error ? error.message : 'Gagal me-reset MFA pengguna');
            }
        });
    };

    const columns = [
        columnHelper.accessor('name', {
            header: 'Nama',
            cell: (info) => {
                const isOnline = info.row.original.is_online;
                return (
                    <div className="flex items-center gap-2">
                        <div
                            className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-success shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-muted-foreground/30'}`}
                            title={isOnline ? 'Online' : 'Offline'}
                        />
                        <span className="font-medium">{info.getValue() || '-'}</span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('email', {
            header: 'Email',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('nik', {
            header: 'NIK',
            cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('rbac_role_name', {
            header: 'Role & Scope',
            cell: (info) => {
                const user = info.row.original;
                const roleLabel = user.is_superuser
                    ? 'SuperUser'
                    : user.rbac_role_name || user.role || 'Belum Diatur';
                const badgeClass = user.is_superuser
                    ? 'border-primary/40 bg-primary/15 text-primary font-semibold'
                    : user.rbac_role_key === 'PEJABAT_AREA' ||
                        user.rbac_role_key === 'PEJABAT_REGIONAL'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : user.rbac_role_key === 'PEJABAT_BRANCH' || user.rbac_role_key === 'TL_SA'
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : user.rbac_role_key === 'STAFF_GUDANG'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-muted text-foreground';

                return (
                    <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={badgeClass}>
                                {roleLabel}
                            </Badge>
                            {user.scope_valid_until && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 border-warning/40 text-warning bg-warning/10"
                                >
                                    PLT
                                </Badge>
                            )}
                        </div>
                        <span className="text-[11px] text-muted-foreground max-w-[200px] truncate">
                            {user.scope_summary || '-'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('lensa_acount', {
            header: 'Lensa',
            cell: (info) => {
                const isLinked = !!info.getValue();
                return isLinked ? (
                    <Badge
                        variant="outline"
                        className="border-success/30 text-success bg-success/10"
                    >
                        Terhubung
                    </Badge>
                ) : (
                    <span className="text-muted-foreground">-</span>
                );
            },
        }),
        columnHelper.accessor('is_active', {
            header: 'Aktif',
            cell: (info) => {
                const isActive = info.getValue() === true;
                const userId = info.row.original.id;
                return (
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggleStatus(userId, isActive)}
                            disabled={isPending || !canManageUsers}
                        />
                        <span className="text-sm text-muted-foreground">
                            {isActive ? 'Ya' : 'Tidak'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('appr_api', {
            header: 'Akses API',
            cell: (info) => {
                const isApproved = info.getValue() === true;
                const hasApiKey = info.row.original.has_api_key === true;
                const userId = info.row.original.id;
                return (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center space-x-2">
                            <Switch
                                checked={isApproved}
                                onCheckedChange={() => handleToggleApiApproval(userId, isApproved)}
                                disabled={isPending || !canManageUsers}
                                aria-label="Toggle status approval API"
                            />
                            <span
                                className={`text-xs font-medium ${isApproved ? 'text-success' : 'text-muted-foreground'}`}
                            >
                                {isApproved ? 'Disetujui' : 'Nonaktif'}
                            </span>
                        </div>
                        <div>
                            {hasApiKey ? (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 border-primary/30 text-primary bg-primary/5"
                                >
                                    Kunci Dibuat
                                </Badge>
                            ) : (
                                <span className="text-[10px] text-muted-foreground italic">
                                    Tanpa Kunci
                                </span>
                            )}
                        </div>
                    </div>
                );
            },
        }),
        columnHelper.accessor('twoFactorEnabled', {
            header: 'MFA & Perangkat',
            cell: (info) => {
                const isMfaActive = info.getValue() === true;
                const user = info.row.original;
                const deviceCount = user.active_devices_count || 0;

                return (
                    <div className="flex flex-col gap-1 items-start">
                        {isMfaActive ? (
                            <Badge
                                variant="outline"
                                className="flex items-center gap-1 text-[11px] border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                            >
                                <ShieldCheck className="w-3 h-3" />
                                <span>Aktif ({deviceCount}/3)</span>
                            </Badge>
                        ) : (
                            <Badge
                                variant="outline"
                                className="text-[11px] border-muted text-muted-foreground"
                            >
                                Belum Aktif
                            </Badge>
                        )}

                        <button
                            type="button"
                            onClick={() => setSelectedUserDevices(user)}
                            className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                        >
                            <Smartphone className="w-3 h-3" />
                            <span>Kelola ({deviceCount})</span>
                        </button>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Aksi</div>,
            cell: (info) => {
                const user = info.row.original;
                const hasMfaOrDevices =
                    user.twoFactorEnabled || (user.active_devices_count || 0) > 0;
                return (
                    <div className="flex justify-center items-center gap-2">
                        <PermissionGate permission="users:manage">
                            {!user.is_superuser && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 border-primary/30 text-primary hover:bg-primary/10"
                                    disabled={isPending}
                                    onClick={() => setSelectedUserScope(user)}
                                    title="Atur Role dan Cakupan Wilayah (RBAC/SBAC)"
                                >
                                    <SlidersHorizontal size={14} /> Role & Scope
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-warning hover:text-warning/80 gap-1 border-warning/30 hover:bg-warning/10"
                                disabled={isPending || !hasMfaOrDevices}
                                onClick={() => setUserToResetMfa(user)}
                                title={
                                    hasMfaOrDevices
                                        ? 'Reset MFA dan seluruh perangkat terdaftar'
                                        : 'MFA belum aktif'
                                }
                            >
                                <ShieldAlert size={14} /> Reset MFA
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setUserToDelete(user)}
                                disabled={isPending || user.is_superuser}
                                className="gap-1"
                            >
                                <Trash2 size={14} /> Hapus
                            </Button>
                        </PermissionGate>
                    </div>
                );
            },
        }),
    ];

    const table = useReactTable({
        data: users,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        initialState: { pagination: { pageSize: 20 } },
        state: {
            globalFilter: nikFilter,
        },
        globalFilterFn: (row, _columnId, filterValue) => {
            const nik = row.getValue('nik') as string;
            if (!nik) return false;
            return nik.toLowerCase().includes(filterValue.toLowerCase());
        },
        onGlobalFilterChange: setNikFilter,
    });

    const hasActiveFilters = Boolean(nikFilter.trim());

    const handleResetFilters = useCallback(() => {
        setNikFilter('');
    }, []);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetFilters,
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-4 flex flex-col p-4"
        >
            <div className="flex items-center gap-2">
                <SearchField
                    wrapperClassName="w-full max-w-sm"
                    placeholder="Cari berdasarkan NIK..."
                    value={nikFilter}
                    onValueChange={setNikFilter}
                    onClear={handleResetFilters}
                    clearLabel="Hapus filter NIK pengguna"
                />
            </div>

            <DataTable table={table} maxHeight="min(65vh, 720px)" />
            <DataTablePagination table={table} />

            <ConfirmDialog
                isOpen={!!userToDelete}
                onOpenChange={(open) => {
                    if (!open) setUserToDelete(null);
                }}
                title="Hapus Pengguna"
                description={`Apakah Anda yakin ingin menghapus pengguna "${userToDelete?.name || userToDelete?.nik || ''}"? Tindakan ini tidak dapat dibatalkan.`}
                confirmText="Hapus Pengguna"
                cancelText="Batal"
                variant="destructive"
                onConfirm={handleConfirmDelete}
                loading={isPending}
            />

            <ConfirmDialog
                isOpen={!!userToResetMfa}
                onOpenChange={(open) => {
                    if (!open) setUserToResetMfa(null);
                }}
                title="Reset MFA & Perangkat Pengguna"
                description={`Apakah Anda yakin ingin me-reset pengaturan MFA dan mencabut seluruh perangkat untuk "${userToResetMfa?.name || userToResetMfa?.nik || ''}"? Pengguna akan diminta mendaftarkan ulang Authenticator pada login berikutnya.`}
                confirmText="Reset MFA"
                cancelText="Batal"
                variant="destructive"
                onConfirm={handleConfirmResetMfa}
                loading={isPending}
            />

            <UserDevicesDialog
                user={selectedUserDevices}
                isOpen={!!selectedUserDevices}
                onClose={() => setSelectedUserDevices(null)}
                onRefresh={async () => {
                    const latest = await getUsers();
                    setUsers(latest);
                }}
            />

            <UserScopeModal
                open={!!selectedUserScope}
                onOpenChange={(open) => {
                    if (!open) setSelectedUserScope(null);
                }}
                user={
                    selectedUserScope
                        ? {
                              nik: selectedUserScope.nik,
                              name: selectedUserScope.name,
                              email: selectedUserScope.email,
                              currentRoleKey: selectedUserScope.rbac_role_key,
                              currentArea: selectedUserScope.scope_area,
                              currentRegional: selectedUserScope.scope_regional,
                              currentBranch: selectedUserScope.scope_branch,
                              currentServiceArea: selectedUserScope.scope_service_area,
                              currentWarehouseIds: selectedUserScope.scope_warehouse_ids,
                              currentValidUntil: selectedUserScope.scope_valid_until,
                          }
                        : null
                }
                hierarchy={hierarchy}
                actorHierarchyLevel={hierarchyLevel}
                isActorSuperUser={isSuperUser}
                onSave={async (payload) => {
                    const res = await saveUserScopeMappingAction(payload);
                    if (res.success) {
                        toast.success(
                            `Role & Scope untuk "${selectedUserScope?.name || payload.userNik}" berhasil diperbarui.`
                        );
                        const latest = await getUsers();
                        setUsers(latest);
                    }
                    return res;
                }}
            />
        </motion.div>
    );
}
