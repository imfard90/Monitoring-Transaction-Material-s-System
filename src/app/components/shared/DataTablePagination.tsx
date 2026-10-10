import type { Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';

interface DataTablePaginationProps<TData> {
    table: Table<TData>;
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
    return (
        <div
            className="flex items-center justify-between"
            role="navigation"
            aria-label="Navigasi halaman tabel"
        >
            <div className="text-sm text-muted-foreground">
                Halaman {table.getState().pagination.pageIndex + 1} dari{' '}
                {table.getPageCount()}
            </div>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    aria-label="Halaman sebelumnya"
                >
                    Sebelumnya
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    aria-label="Halaman berikutnya"
                >
                    Berikutnya
                </Button>
            </div>
        </div>
    );
}
