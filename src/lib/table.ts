import { flexRender as baseFlexRender } from '@tanstack/react-table';
import {
    getCoreRowModel as baseGetCoreRowModel,
    getExpandedRowModel as baseGetExpandedRowModel,
    getFacetedMinMaxValues as baseGetFacetedMinMaxValues,
    getFacetedRowModel as baseGetFacetedRowModel,
    getFacetedUniqueValues as baseGetFacetedUniqueValues,
    getFilteredRowModel as baseGetFilteredRowModel,
    getPaginationRowModel as baseGetPaginationRowModel,
    getSortedRowModel as baseGetSortedRowModel,
    legacyCreateColumnHelper,
    type LegacyCell,
    type LegacyColumn,
    type LegacyColumnDef,
    type LegacyHeader,
    type LegacyHeaderGroup,
    type LegacyReactTable,
    type LegacyRow,
    type LegacyTable,
    type LegacyTableOptions,
    useLegacyTable,
} from '@tanstack/react-table/legacy';

export const flexRender = baseFlexRender;
export const createColumnHelper = legacyCreateColumnHelper;
export const getCoreRowModel = baseGetCoreRowModel;
export const getPaginationRowModel = baseGetPaginationRowModel;
export const getSortedRowModel = baseGetSortedRowModel;
export const getFilteredRowModel = baseGetFilteredRowModel;
export const getExpandedRowModel = baseGetExpandedRowModel;
export const getFacetedMinMaxValues = baseGetFacetedMinMaxValues;
export const getFacetedRowModel = baseGetFacetedRowModel;
export const getFacetedUniqueValues = baseGetFacetedUniqueValues;

export interface ColumnSort {
    desc: boolean;
    id: string;
}
export type SortingState = ColumnSort[];

export interface ColumnFilter {
    id: string;
    value: unknown;
}
export type ColumnFiltersState = ColumnFilter[];
export type VisibilityState = Record<string, boolean>;

type SafeRowData<TData> = TData extends Record<string, any> ? TData : any;

export type Table<TData = any> = (
    | LegacyReactTable<SafeRowData<TData>>
    | LegacyTable<SafeRowData<TData>>
) & {
    getState: () => any;
};

export type ColumnDef<TData = any, TValue = any> = LegacyColumnDef<SafeRowData<TData>, TValue>;
export type Row<TData = any> = LegacyRow<SafeRowData<TData>>;
export type Cell<TData = any, TValue = any> = LegacyCell<SafeRowData<TData>, TValue>;
export type Header<TData = any, TValue = any> = LegacyHeader<SafeRowData<TData>, TValue>;
export type HeaderGroup<TData = any> = LegacyHeaderGroup<SafeRowData<TData>>;
export type Column<TData = any, TValue = any> = LegacyColumn<SafeRowData<TData>, TValue>;
export type TableOptions<TData = any> = LegacyTableOptions<SafeRowData<TData>>;

export function useReactTable<TData = any>(
    options: Omit<LegacyTableOptions<SafeRowData<TData>>, 'columns' | 'initialState'> & {
        columns: any[];
        initialState?: any;
        state?: any;
    }
): Table<TData> {
    return useLegacyTable(options as any) as Table<TData>;
}
