'use client';

import {
    createColumnHelper,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { deleteUser, toggleUserStatus } from './actions';

interface UserTableProps {
    data: any[];
}

const columnHelper = createColumnHelper<any>();

export default function UserTable({ data }: UserTableProps) {
    const [isPending, startTransition] = useTransition();
    const [nikFilter, setNikFilter] = useState('');

    const handleToggleStatus = (userId: string, currentStatus: boolean) => {
        startTransition(async () => {
            try {
                await toggleUserStatus(userId, !currentStatus);
                toast.success(`User status ${currentStatus ? 'deactivated' : 'activated'}`);
            } catch (error: unknown) {
                toast.error(
                    error instanceof Error ? error.message : 'Failed to update user status'
                );
            }
        });
    };

    const handleDelete = (userId: string) => {
        if (
            window.confirm(
                'Are you sure you want to delete this user? This action cannot be undone.'
            )
        ) {
            startTransition(async () => {
                try {
                    await deleteUser(userId);
                    toast.success('User deleted successfully');
                } catch (error: unknown) {
                    toast.error(error instanceof Error ? error.message : 'Failed to delete user');
                }
            });
        }
    };

    const columns = [
        columnHelper.accessor('name', {
            header: 'Name',
            cell: (info) => {
                const isOnline = info.row.original.is_online;
                return (
                    <div className="flex items-center gap-2">
                        <div
                            className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-gray-300 dark:bg-gray-600'}`}
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
        columnHelper.accessor('role', {
            header: 'Role',
            cell: (info) => (
                <Badge
                    variant="outline"
                    className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                >
                    {info.getValue() || 'Unknown'}
                </Badge>
            ),
        }),
        columnHelper.accessor('lensa_acount', {
            header: 'Lensa',
            cell: (info) => {
                const isLinked = !!info.getValue();
                return isLinked ? (
                    <Badge
                        variant="outline"
                        className="border-green-200 text-green-600 bg-green-50 dark:bg-green-950 dark:border-green-900"
                    >
                        Linked
                    </Badge>
                ) : (
                    <span className="text-muted-foreground">-</span>
                );
            },
        }),
        columnHelper.accessor('is_active', {
            header: 'Active',
            cell: (info) => {
                const isActive = info.getValue() === true;
                const userId = info.row.original.id;
                return (
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggleStatus(userId, isActive)}
                            disabled={isPending}
                        />
                        <span className="text-sm text-muted-foreground">
                            {isActive ? 'Yes' : 'No'}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Action</div>,
            cell: (info) => {
                const userId = info.row.original.id;
                return (
                    <div className="flex justify-center items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-orange-500 hover:text-orange-600 gap-1"
                            disabled={true}
                            title="Coming Soon"
                        >
                            <ShieldAlert size={14} /> Reset MFA
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(userId)}
                            disabled={isPending}
                            className="gap-1"
                        >
                            <Trash2 size={14} /> Delete
                        </Button>
                    </div>
                );
            },
        }),
    ];

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        initialState: { pagination: { pageSize: 15 } },
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

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-4 flex flex-col p-4"
        >
            <div className="flex items-center gap-2">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by NIK..."
                        value={nikFilter}
                        onChange={(e) => setNikFilter(e.target.value)}
                        className="pl-9 pr-9"
                    />
                    {nikFilter && (
                        <button
                            type="button"
                            onClick={() => setNikFilter('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground flex items-center justify-center"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            <DataTable table={table} />
            <DataTablePagination table={table} />
        </motion.div>
    );
}
