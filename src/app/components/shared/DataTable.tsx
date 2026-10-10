import { flexRender, type Table } from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';

interface DataTableProps<TData> {
    table: Table<TData>;
    isLoading?: boolean;
    emptyMessage?: string;
}

export function DataTable<TData>({
    table,
    isLoading = false,
    emptyMessage = 'Belum ada data yang ditemukan.',
}: DataTableProps<TData>) {
    return (
        <div
            className="rounded-md border overflow-x-auto"
            aria-busy={isLoading}
        >
            <table className="w-full text-sm text-left text-muted-foreground whitespace-nowrap">
                <thead className="text-sm text-foreground uppercase bg-muted/50 border-b sticky top-0 z-10 shadow-sm">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="px-3 py-1.5 font-semibold"
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
                                        <td key={cell.id} className="px-3 py-1.5">
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
