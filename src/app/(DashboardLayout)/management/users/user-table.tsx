'use client';

import { motion } from 'framer-motion';
import {
    KeyRound,
    MoreHorizontal,
    RotateCcw,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Smartphone,
    Trash2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useAuthPermissions } from '@/components/auth/SessionPermissionProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchField } from '@/components/ui/search-field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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

type RoleFilterValue = 'ALL' | 'SUPERUSER' | 'UNASSIGNED' | RoleKey;
type StatusFilterValue = 'ALL' | 'ONLINE' | 'ACTIVE' | 'INACTIVE' | 'API_APPROVED' | 'NO_MFA';

const columnHelper = createColumnHelper<UserItem>();

function getInitials(name?: string | null): string {
    const clean = (name ?? '').trim();
    if (!clean) return '?';
    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function UserTable({ data, hierarchy }: UserTableProps) {
    const { can, isSuperUser, hierarchyLevel } = useAuthPermissions();
    const canManageUsers = can('users:manage');
    const [users, setUsers] = useState(data);
    const [isPending, startTransition] = useTransition();

    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilterValue>('ALL');
    const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('ALL');

    const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
    const [userToResetMfa, setUserToResetMfa] = useState<UserItem | null>(null);
    const [selectedUserDevices, setSelectedUserDevices] = useState<UserItem | null>(null);
    const [selectedUserScope, setSelectedUserScope] = useState<UserItem | null>(null);

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

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            if (roleFilter === 'SUPERUSER' && !u.is_superuser) return false;
            if (roleFilter === 'UNASSIGNED' && (u.is_superuser || Boolean(u.rbac_role_key))) {
                return false;
            }
            if (
                roleFilter !== 'ALL' &&
                roleFilter !== 'SUPERUSER' &&
                roleFilter !== 'UNASSIGNED' &&
                u.rbac_role_key !== roleFilter
            ) {
                return false;
            }

            if (statusFilter === 'ONLINE' && !u.is_online) return false;
            if (statusFilter === 'ACTIVE' && u.is_active !== true) return false;
            if (statusFilter === 'INACTIVE' && u.is_active === true) return false;
            if (statusFilter === 'API_APPROVED' && u.appr_api !== true) return false;
            if (statusFilter === 'NO_MFA' && u.twoFactorEnabled === true) return false;

            return true;
        });
    }, [users, roleFilter, statusFilter]);

    const handleToggleStatus = (userId: string, currentStatus: boolean) => {
        startTransition(async () => {
            try {
                await toggleUserStatus(userId, !currentStatus);
                setUsers((prev) =>
                    prev.map((u) => (u.id === userId ? { ...u, is_active: !currentStatus } : u))
                );
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
                setUsers((prev) =>
                    prev.map((u) => (u.id === userId ? { ...u, appr_api: !currentStatus } : u))
                );
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
                setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
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
            header: 'Pengguna',
            cell: (info) => {
                const user = info.row.original;
                return (
                    <div className="flex items-center gap-2.5 min-w-50">
                        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary border border-primary/20">
                            {getInitials(user.name)}
                            <span
                                className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card ${
                                    user.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/35'
                                }`}
                                title={user.is_online ? 'Online' : 'Offline'}
                            />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="font-medium text-sm leading-tight text-foreground truncate">
                                {user.name || '-'}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-muted-foreground truncate">
                                {user.nik || '-'} · {user.email || '-'}
                            </span>
                        </div>
                    </div>
                );
            },
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
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400'
                      : user.rbac_role_key === 'PEJABAT_BRANCH' || user.rbac_role_key === 'TL_SA'
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        : user.rbac_role_key === 'STAFF_GUDANG'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400'
                          : 'bg-muted text-foreground';

                return (
                    <div className="flex flex-col gap-1 items-start min-w-40">
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
                        <span className="text-[11px] text-muted-foreground max-w-55 truncate">
                            {user.scope_summary || '-'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('twoFactorEnabled', {
            header: 'Keamanan & Integrasi',
            cell: (info) => {
                const isMfaActive = info.getValue() === true;
                const user = info.row.original;
                const deviceCount = user.active_devices_count || 0;
                const isLensaLinked = Boolean(user.lensa_acount);
                const hasApiKey = user.has_api_key === true;

                return (
                    <div className="flex flex-col gap-1 items-start">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {isMfaActive ? (
                                <Badge
                                    variant="outline"
                                    className="flex items-center gap-1 text-[10.5px] py-0 px-1.5 border-emerald-500/30 text-emerald-800 dark:text-emerald-400 bg-emerald-500/10 tabular-nums"
                                >
                                    <ShieldCheck className="size-3" />
                                    <span>MFA {deviceCount}/3</span>
                                </Badge>
                            ) : (
                                <Badge
                                    variant="outline"
                                    className="text-[10.5px] py-0 px-1.5 border-border text-muted-foreground"
                                >
                                    MFA Off
                                </Badge>
                            )}
                            {isLensaLinked && (
                                <Badge
                                    variant="outline"
                                    className="text-[10.5px] py-0 px-1.5 border-success/30 text-success bg-success/10"
                                >
                                    Lensa
                                </Badge>
                            )}
                            {hasApiKey && (
                                <Badge
                                    variant="outline"
                                    className="flex items-center gap-0.5 text-[10.5px] py-0 px-1.5 border-primary/30 text-primary bg-primary/5"
                                >
                                    <KeyRound className="size-2.5" />
                                    <span>API Key</span>
                                </Badge>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedUserDevices(user)}
                            className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium tabular-nums"
                        >
                            <Smartphone className="size-3" />
                            <span>Kelola Perangkat ({deviceCount})</span>
                        </button>
                    </div>
                );
            },
        }),
        columnHelper.accessor('is_active', {
            header: 'Akun',
            cell: (info) => {
                const isActive = info.getValue() === true;
                const user = info.row.original;
                return (
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggleStatus(user.id, isActive)}
                            disabled={isPending || !canManageUsers}
                            aria-label={`Toggle status aktif ${user.name || user.nik}`}
                        />
                        <span className="text-xs font-medium text-muted-foreground">
                            {isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('appr_api', {
            header: 'Akses API',
            cell: (info) => {
                const isApproved = info.getValue() === true;
                const user = info.row.original;
                return (
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={isApproved}
                            onCheckedChange={() => handleToggleApiApproval(user.id, isApproved)}
                            disabled={isPending || !canManageUsers}
                            aria-label={`Toggle status approval API ${user.name || user.nik}`}
                        />
                        <span
                            className={`text-xs font-medium ${isApproved ? 'text-success' : 'text-muted-foreground'}`}
                        >
                            {isApproved ? 'Disetujui' : 'Nonaktif'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-right">Aksi</div>,
            cell: (info) => {
                const user = info.row.original;
                const hasMfaOrDevices =
                    user.twoFactorEnabled || (user.active_devices_count || 0) > 0;
                return (
                    <div className="flex justify-end items-center gap-1.5">
                        <PermissionGate permission="users:manage">
                            {!user.is_superuser && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 text-xs"
                                    disabled={isPending}
                                    onClick={() => setSelectedUserScope(user)}
                                    title="Atur Role dan Cakupan Wilayah (RBAC/SBAC)"
                                >
                                    <SlidersHorizontal className="size-3.5" />
                                    <span>Role & Scope</span>
                                </Button>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 text-muted-foreground hover:text-foreground"
                                        aria-label={`Aksi lainnya untuk ${user.name || user.nik}`}
                                        disabled={isPending}
                                    >
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem
                                        onClick={() => setSelectedUserDevices(user)}
                                        className="gap-2 cursor-pointer"
                                    >
                                        <Smartphone className="size-3.5" />
                                        <span>
                                            Kelola Perangkat ({user.active_devices_count || 0})
                                        </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setUserToResetMfa(user)}
                                        disabled={!hasMfaOrDevices}
                                        className="gap-2 cursor-pointer text-warning focus:text-warning"
                                    >
                                        <ShieldAlert className="size-3.5" />
                                        <span>Reset MFA & Perangkat</span>
                                    </DropdownMenuItem>
                                    {!user.is_superuser && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => setUserToDelete(user)}
                                                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="size-3.5" />
                                                <span>Hapus Pengguna</span>
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </PermissionGate>
                    </div>
                );
            },
        }),
    ];

    const table = useReactTable({
        data: filteredUsers,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        initialState: { pagination: { pageSize: 20 } },
        state: {
            globalFilter: searchQuery,
        },
        globalFilterFn: (row, _columnId, filterValue) => {
            const q = String(filterValue ?? '')
                .trim()
                .toLowerCase();
            if (!q) return true;
            const user = row.original;
            return (
                (user.name ?? '').toLowerCase().includes(q) ||
                (user.nik ?? '').toLowerCase().includes(q) ||
                (user.email ?? '').toLowerCase().includes(q)
            );
        },
        onGlobalFilterChange: setSearchQuery,
    });

    const hasActiveFilters =
        Boolean(searchQuery.trim()) || roleFilter !== 'ALL' || statusFilter !== 'ALL';

    const handleResetFilters = useCallback(() => {
        setSearchQuery('');
        setRoleFilter('ALL');
        setStatusFilter('ALL');
    }, []);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetFilters,
    });

    const displayedCount = table.getFilteredRowModel().rows.length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="space-y-3.5 flex flex-col p-4"
        >
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                    <SearchField
                        wrapperClassName="w-full sm:w-72"
                        placeholder="Cari nama, NIK, atau email..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        onClear={() => setSearchQuery('')}
                        clearLabel="Hapus pencarian pengguna"
                    />

                    <Select
                        value={roleFilter}
                        onValueChange={(val) => setRoleFilter(val as RoleFilterValue)}
                    >
                        <SelectTrigger
                            className="h-9 w-45 text-xs"
                            aria-label="Filter berdasarkan role"
                        >
                            <SelectValue placeholder="Semua Role" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Semua Role</SelectItem>
                            <SelectItem value="SUPERUSER">SuperUser</SelectItem>
                            {hierarchy.roles.map((r) => (
                                <SelectItem key={r.role_key} value={r.role_key}>
                                    {r.role_name}
                                </SelectItem>
                            ))}
                            <SelectItem value="UNASSIGNED">Belum Diatur Scope</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select
                        value={statusFilter}
                        onValueChange={(val) => setStatusFilter(val as StatusFilterValue)}
                    >
                        <SelectTrigger
                            className="h-9 w-42 text-xs"
                            aria-label="Filter berdasarkan status"
                        >
                            <SelectValue placeholder="Semua Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Semua Status</SelectItem>
                            <SelectItem value="ONLINE">Online Sekarang</SelectItem>
                            <SelectItem value="ACTIVE">Akun Aktif</SelectItem>
                            <SelectItem value="INACTIVE">Akun Nonaktif</SelectItem>
                            <SelectItem value="API_APPROVED">API Disetujui</SelectItem>
                            <SelectItem value="NO_MFA">MFA Belum Aktif</SelectItem>
                        </SelectContent>
                    </Select>

                    {hasActiveFilters && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleResetFilters}
                            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <RotateCcw className="size-3.5" />
                            <span>Reset</span>
                        </Button>
                    )}
                </div>

                <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                    Menampilkan{' '}
                    <span className="font-semibold text-foreground">{displayedCount}</span> dari{' '}
                    <span className="font-semibold text-foreground">{users.length}</span> pengguna
                </div>
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
