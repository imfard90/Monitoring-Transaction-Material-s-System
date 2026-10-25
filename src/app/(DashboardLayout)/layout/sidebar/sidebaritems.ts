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
                id: 'home-dashboard',
                name: 'Dashboard',
                icon: 'solar:widget-2-linear',
                url: '/',
                isPro: false,
            },
            {
                id: 'home-stock-inventory',
                name: 'Stock Inventory',
                icon: 'solar:box-minimalistic-linear',
                url: '/stock-inventory',
                isPro: false,
            },
            {
                id: 'home-stock-intech',
                name: 'Stock Intech',
                icon: 'solar:server-square-linear',
                url: '/stock-intech',
                isPro: false,
            },
        ],
    },
    {
        heading: 'Form',
        children: [
            {
                id: 'pages-out-sap',
                name: 'Out SAP',
                icon: 'solar:box-linear',
                url: '/form/out-sap',
                isPro: false,
            },
            {
                id: 'pages-rekon-intech',
                name: 'Rekon Intech',
                icon: 'solar:checklist-minimalistic-linear',
                url: '/form/rekon-intech',
                isPro: false,
            },
            {
                id: 'pages-rekon-lensa',
                name: 'Rekon Lensa',
                icon: 'solar:clipboard-check-linear',
                url: '/form/rekon-lensa',
                isPro: false,
            },
            {
                id: 'pages-return-material',
                name: 'Return Material',
                icon: 'solar:restart-circle-linear',
                url: '/form/return-material',
                isPro: false,
            },
            {
                id: 'pages-stock-opname',
                name: 'Stock Opname',
                icon: 'solar:checklist-minimalistic-linear',
                url: '/form/stock-opname',
                isPro: false,
            },
        ],
    },
    {
        heading: 'Apps',
        children: [
            {
                id: 'apps-inout-tag',
                name: 'InOut Tag',
                icon: 'solar:tag-linear',
                url: '/apps/inout-tag',
                isPro: false,
            },
            {
                id: 'apps-out-material',
                name: 'Out Material',
                icon: 'solar:delivery-linear',
                url: '/apps/out-material',
                isPro: false,
            },
            {
                id: 'apps-hasil-rekon',
                name: 'Hasil Rekon',
                icon: 'solar:document-text-linear',
                url: '/apps/hasil-rekon',
                isPro: false,
            },
            {
                id: 'apps-stock-movement',
                name: 'Stock Movement',
                icon: 'solar:history-linear',
                url: '/apps/stock-movement',
                isPro: false,
            },
        ],
    },
    {
        heading: 'Management',
        children: [
            {
                id: 'mgmt-user-profile',
                name: 'User Profile',
                icon: 'solar:user-circle-linear',
                url: '/management/user-profile',
                isPro: false,
            },
            {
                id: 'mgmt-users',
                name: 'Users',
                icon: 'solar:users-group-rounded-linear',
                url: '/management/users',
                isPro: false,
            },
            {
                id: 'mgmt-technician',
                name: 'Technicians',
                icon: 'solar:shield-user-linear',
                url: '/management/technician',
                isPro: false,
            },
        ],
    },
    {
        heading: 'Reference',
        children: [
            {
                id: 'ref-out-lensa-ref',
                name: 'Out Lensa Ref',
                icon: 'solar:import-linear',
                url: '/reference/out-lensa-ref',
                isPro: false,
            },
            {
                id: 'ref-wo-lensa-ref',
                name: 'WO Lensa Ref',
                icon: 'solar:notes-linear',
                url: '/reference/wo-lensa-ref',
                isPro: false,
            },
            {
                id: 'ref-stock-comparison',
                name: 'Intech Lensa Vs MTMS',
                icon: 'solar:chart-2-linear',
                url: '/reference/stock-comparison',
                isPro: false,
            },
        ],
    },
];

export default SidebarContent;
