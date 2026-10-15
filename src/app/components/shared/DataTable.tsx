import { flexRender, type Table } from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

interface DataTableProps<TData> {
    table: Table<TData>;
    isLoading?: boolean;
    emptyMessage?: string;
    className?: string;
    maxHeight?: string;
    skeletonRowCount?: number;
}

export function DataTable<TData>({
    table,
    isLoading = false,
    emptyMessage = 'Belum ada data yang ditemukan.',
    className,
    maxHeight,
    skeletonRowCount = 5,
}: DataTableProps<TData>) {
    const rows = table.getRowModel().rows;
    const shouldAnimate = rows.length > 0 && rows.length <= 25;

    return (
        <div
            className={className || 'rounded-md border overflow-auto'}
            style={maxHeight ? { maxHeight } : undefined}
            aria-busy={isLoading}
        >
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
                        Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
                            <tr key={`skeleton-${rowIndex}`} className="bg-background border-b">
                                {table.getAllColumns().map((column, colIndex) => (
                                    <td
                                        key={`skeleton-cell-${colIndex}`}
                                        className="px-3 py-2.5"
                                        style={
                                            column.columnDef.size
                                                ? { width: column.columnDef.size }
                                                : undefined
                                        }
                                    >
                                        <Skeleton className="h-4 w-full min-w-[50px] max-w-[200px]" />
                                        {rowIndex === 0 && colIndex === 0 && (
                                            <span className="sr-only" role="status">
                                                Memuat data...
                                            </span>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : rows.length === 0 ? (
                        <tr>
                            <td
                                colSpan={table.getAllColumns().length}
                                className="px-3 py-8 text-center text-muted-foreground"
                                role="status"
                            >
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        <AnimatePresence>
                            {rows.map((row, i) => (
                                <motion.tr
                                    key={row.id}
                                    initial={shouldAnimate ? { opacity: 0, y: 10 } : false}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={
                                        shouldAnimate
                                            ? { duration: 0.2, delay: i * 0.02 }
                                            : { duration: 0 }
                                    }
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
