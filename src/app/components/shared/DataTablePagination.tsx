import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface DataTablePaginationProps<TData> {
    table: Table<TData>;
    pageSizeOptions?: number[];
    showPageJump?: boolean;
    showPageSize?: boolean;
}

export function DataTablePagination<TData>({
    table,
    pageSizeOptions = [10, 20, 30, 50, 100],
    showPageJump = true,
    showPageSize = true,
}: DataTablePaginationProps<TData>) {
    const pageIndex = table.getState().pagination.pageIndex;
    const pageCount = table.getPageCount();
    const pageSize = table.getState().pagination.pageSize;
    const [jumpPage, setJumpPage] = useState('');

    useEffect(() => {
        try {
            const saved = localStorage.getItem('mtms_table_page_size');
            if (saved) {
                const parsed = Number(saved);
                if (pageSizeOptions.includes(parsed) && parsed !== pageSize) {
                    table.setPageSize(parsed);
                }
            }
        } catch {
            // ignore localStorage error on SSR/disabled cookies
        }
    }, [pageSizeOptions, table, pageSize]);

    const handleJump = (e: React.FormEvent) => {
        e.preventDefault();
        const pageNumber = parseInt(jumpPage, 10);
        if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount) {
            table.setPageIndex(pageNumber - 1);
            setJumpPage('');
        }
    };

    return (
        <nav
            className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-1 text-sm text-muted-foreground"
            aria-label="Navigasi halaman tabel"
        >
            <div className="flex items-center gap-4 flex-wrap">
                <div>
                    Halaman <span className="font-medium text-foreground">{pageIndex + 1}</span>{' '}
                    dari <span className="font-medium text-foreground">{pageCount || 1}</span>
                </div>

                {showPageSize && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs">Baris per hal:</span>
                        <Select
                            value={`${pageSize}`}
                            onValueChange={(val) => {
                                const size = Number(val);
                                table.setPageSize(size);
                                try {
                                    localStorage.setItem('mtms_table_page_size', String(size));
                                } catch {
                                    // ignore localStorage errors
                                }
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px] text-xs">
                                <SelectValue placeholder={pageSize} />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {pageSizeOptions.map((size) => (
                                    <SelectItem key={size} value={`${size}`} className="text-xs">
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {showPageJump && pageCount > 1 && (
                    <form onSubmit={handleJump} className="flex items-center gap-1.5 mr-2">
                        <span className="text-xs">Lompat:</span>
                        <Input
                            type="number"
                            min={1}
                            max={pageCount}
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            className="h-8 w-14 text-center text-xs px-1"
                            placeholder={`${pageIndex + 1}`}
                            aria-label="Nomor halaman tujuan"
                        />
                    </form>
                )}

                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                        aria-label="Halaman pertama"
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        aria-label="Sebelumnya"
                        title="Sebelumnya"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Sebelumnya</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        aria-label="Berikutnya"
                        title="Berikutnya"
                    >
                        <ChevronRight className="h-4 w-4" />
                        <span className="sr-only">Berikutnya</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.setPageIndex(pageCount - 1)}
                        disabled={!table.getCanNextPage()}
                        aria-label="Halaman terakhir"
                    >
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </nav>
    );
}
