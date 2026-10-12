import { flexRender, type Table } from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';

interface DataTableProps<TData> {
    table: Table<TData>;
    isLoading?: boolean;
    emptyMessage?: string;
    className?: string;
}

export function DataTable<TData>({
    table,
    isLoading = false,
    emptyMessage = 'Belum ada data yang ditemukan.',
    className,
}: DataTableProps<TData>) {
    return (
        <div className={className || 'rounded-md border overflow-x-auto'} aria-busy={isLoading}>
            <table className="w-full text-sm text-left text-muted-foreground whitespace-nowrap">
                <thead className="text-sm text-foreground uppercase bg-muted border-b border-border sticky top-0 z-20 shadow-sm">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id} className="bg-muted">
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="px-3 py-1.5 font-semibold bg-muted"
                                    style={
                                        header.column.columnDef.size
                                            ? { width: header.column.columnDef.size }
                                            : undefined
                                    }
                                    scope="col"
                                >
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                              header.column.columnDef.header,
                                              header.getContext()
                                          )}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {isLoading ? (
                        <tr>
                            <td
                                colSpan={table.getAllColumns().length}
                                className="px-3 py-4 text-center text-muted-foreground"
                                role="status"
                            >
                                Memuat data, mohon tunggu...
                            </td>
                        </tr>
                    ) : table.getRowModel().rows?.length === 0 ? (
                        <tr>
                            <td
                                colSpan={table.getAllColumns().length}
                                className="px-3 py-4 text-center text-muted-foreground"
                                role="status"
                            >
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        <AnimatePresence>
                            {table.getRowModel().rows.map((row, i) => (
                                <motion.tr
                                    key={row.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: i * 0.03 }}
                                    className="bg-background border-b hover:bg-muted/50 motion-reduce:transition-none"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            className="px-3 py-1.5"
                                            style={
                                                cell.column.columnDef.size
                                                    ? { width: cell.column.columnDef.size }
                                                    : undefined
                                            }
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </td>
                                    ))}
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    )}
                </tbody>
            </table>
        </div>
    );
}
