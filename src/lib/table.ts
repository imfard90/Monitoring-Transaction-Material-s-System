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
    type LegacyCell,
    type LegacyColumn,
    type LegacyColumnDef,
    type LegacyHeader,
    type LegacyHeaderGroup,
    type LegacyReactTable,
    type LegacyRow,
    type LegacyTable,
    type LegacyTableOptions,
    legacyCreateColumnHelper,
    useLegacyTable,
} from '@tanstack/react-table/legacy';

/**
 * TanStack `RowData` constraint (`Record<string, any> | Array<any>`).
 *
 * Re-declared locally because `@tanstack/table-core` is not a direct dependency.
 * Must stay identical to upstream, otherwise `LegacyTableOptions<TData>` rejects
 * domain row types that have no index signature.
 */
export type RowData = Record<string, any> | Array<any>;

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

/**
 * Table helper types bound to the TanStack v9 "legacy" (v8-compatible) API.
 *
 * `TData` must satisfy TanStack's `RowData` constraint (`Record<string, any> | Array<any>`).
 */
export type Table<TData extends RowData = RowData> = (
    | LegacyReactTable<TData>
    | LegacyTable<TData>
) & {
    getState: () => ReturnType<LegacyReactTable<TData>['getState']>;
};

export type ColumnDef<TData extends RowData = RowData, TValue = unknown> = LegacyColumnDef<
    TData,
    TValue
>;
/**
 * Column definition with an unconstrained cell value type.
 *
 * TanStack's `ColumnDef` is contravariant in `TValue`, so a table that mixes
 * `string` and `number` columns cannot be typed as `ColumnDef<TData, unknown>`.
 * Use this alias when a heterogeneous column array is required.
 */
export type AnyColumnDef<TData extends RowData = RowData> = LegacyColumnDef<TData, any>;
export type Row<TData extends RowData = RowData> = LegacyRow<TData>;
export type Cell<TData extends RowData = RowData, TValue = unknown> = LegacyCell<TData, TValue>;
export type Header<TData extends RowData = RowData, TValue = unknown> = LegacyHeader<TData, TValue>;
export type HeaderGroup<TData extends RowData = RowData> = LegacyHeaderGroup<TData>;
export type Column<TData extends RowData = RowData, TValue = unknown> = LegacyColumn<TData, TValue>;
export type TableOptions<TData extends RowData = RowData> = LegacyTableOptions<TData>;

/**
 * Controlled/initial table state accepted by {@link useReactTable}.
 *
 * The legacy API types `pagination` as a full `PaginationState` (`pageIndex` required),
 * while MTMS callers commonly provide only `pageSize` for `initialState`. Both are
 * accepted here and normalized by TanStack.
 */
export type TableStateInput = {
    pagination?: {
        pageIndex?: number;
        pageSize?: number;
    };
    sorting?: SortingState;
    columnFilters?: ColumnFiltersState;
    columnVisibility?: VisibilityState;
    globalFilter?: unknown;
};

/**
 * Typed wrapper around `useLegacyTable`.
 *
 * Column definitions use `any` for the cell value type because TanStack's
 * `ColumnDef` is contravariant in `TValue`: a mixed array of `ColumnDef<T, string>`
 * and `ColumnDef<T, number>` cannot be expressed as a single `ColumnDef<T, unknown>`.
 * Row data itself stays fully typed via `TData`.
 */
export function useReactTable<TData extends RowData = RowData>(
    options: Omit<LegacyTableOptions<TData>, 'columns' | 'initialState' | 'state'> & {
        columns: ReadonlyArray<ColumnDef<TData, any>>;
        initialState?: TableStateInput;
        state?: TableStateInput;
    }
): Table<TData> {
    return useLegacyTable(options as unknown as LegacyTableOptions<TData>) as Table<TData>;
}
