import { uniqueId } from 'lodash';

export interface ChildItem {
    id?: number | string;
    name?: string;
    icon?: string;
    children?: ChildItem[];
    item?: unknown;
    url?: string;
    color?: string;
    disabled?: boolean;
    subtitle?: string;
    badge?: boolean;
    badgeType?: string;
    isPro?: boolean;
}

export interface MenuItem {
    heading?: string;
    name?: string;
    icon?: string;
    id?: number | string;
    to?: string;
    items?: MenuItem[];
    children?: ChildItem[];
    url?: string;
    disabled?: boolean;
    subtitle?: string;
    badgeType?: string;
    badge?: boolean;
    isPro?: boolean;
}

const SidebarContent: MenuItem[] = [
    {
        heading: 'Home',
        children: [
            {
                name: 'Dashboard',
                icon: 'solar:widget-2-linear',
                id: uniqueId(),
                url: '/',
                isPro: false,
            },
            {
                name: 'Stock Inventory',
                icon: 'solar:box-minimalistic-linear',
                id: uniqueId(),
                url: '/stock-inventory',
                isPro: false,
            },
            {
                name: 'Stock Intech',
                icon: 'solar:clipboard-list-linear',
                id: uniqueId(),
                url: '/stock-intech',
                isPro: false,
            },
        ],
    },
    {
        heading: 'Pages',
        children: [
            {
                id: uniqueId(),
                name: 'User Profile',
                icon: 'solar:user-circle-linear',
                url: '/user-profile',
                isPro: false,
            },
            {
                id: uniqueId(),
                name: 'Out SAP',
                icon: 'solar:box-linear',
                url: '/apps/out-sap',
                isPro: false,
            },
            {
                id: uniqueId(),
                name: 'Rekon Intech',
                icon: 'solar:clipboard-list-linear',
                url: '/apps/rekon-intech',
                isPro: false,
            },
            {
                id: uniqueId(),
                name: 'Return',
                icon: 'solar:refresh-circle-linear',
                url: '/apps/return-material',
                isPro: false,
            },
        ],
    },
    {
        heading: 'Apps',
        children: [
            {
                id: uniqueId(),
                name: 'InOut Tag',
                icon: 'solar:tag-linear',
                url: '/apps/inout-tag',
                isPro: false,
            },
            {
                id: uniqueId(),
                name: 'Out Material',
                icon: 'solar:box-minimalistic-linear',
                url: '/apps/out-material',
                isPro: false,
            },
            {
                id: uniqueId(),
                name: 'Hasil Rekon',
                icon: 'solar:document-text-linear',
                url: '/apps/hasil-rekon',
                isPro: false,
            },
            {
                id: uniqueId(),
                name: 'Stock Movement',
                icon: 'solar:sort-from-bottom-to-top-linear',
                url: '/apps/stock-movement',
                isPro: false,
            },
        ],
    },
    {
        heading: 'Reference',
        children: [
            {
                id: uniqueId(),
                name: 'Iconify Icons',
                icon: 'solar:structure-linear',
                url: '/icons/iconify',
                isPro: false,
            },
        ],
    },
];

export default SidebarContent;
