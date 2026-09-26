'use client';

import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
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
            } catch (error: any) {
                toast.error(error.message || 'Failed to update user status');
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
                } catch (error: any) {
                    toast.error(error.message || 'Failed to delete user');
                }
            });
        }
    };

    const columns = [
        columnHelper.accessor('name', {
            header: 'Name',
            cell: (info) => <span className="font-medium">{info.getValue() || '-'}</span>,
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
        <div className="space-y-4 flex flex-col flex-1 min-h-0 p-4">
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

            <div className="rounded-md border flex-1 overflow-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 dark:text-gray-300 border-b sticky top-0 z-10 shadow-sm">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className="px-4 py-3 font-semibold">
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-6 text-center text-gray-500"
                                >
                                    No users found.
                                </td>
                            </tr>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="bg-card border-b hover:bg-muted/50">
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-4 py-3">
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-2 py-2">
                <div className="text-sm text-muted-foreground">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
