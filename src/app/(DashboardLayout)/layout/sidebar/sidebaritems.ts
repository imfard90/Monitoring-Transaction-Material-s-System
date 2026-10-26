export interface ChildItem {
    id?: number | string;
    name?: string;
    icon?: string;
    iconActive?: string;
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
    iconActive?: string;
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
                iconActive: 'solar:widget-2-bold',
                url: '/',
                isPro: false,
            },
            {
                id: 'home-stock-inventory',
                name: 'Stock Inventory',
                icon: 'solar:box-minimalistic-linear',
                iconActive: 'solar:box-minimalistic-bold',
                url: '/stock-inventory',
                isPro: false,
            },
            {
                id: 'home-stock-intech',
                name: 'Stock Intech',
                icon: 'solar:layers-minimalistic-linear',
                iconActive: 'solar:layers-minimalistic-bold',
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
                icon: 'solar:document-add-linear',
                iconActive: 'solar:document-add-bold',
                url: '/form/out-sap',
                isPro: false,
            },
            {
                id: 'pages-rekon-intech',
                name: 'Rekon Intech',
                icon: 'solar:transfer-horizontal-linear',
                iconActive: 'solar:transfer-horizontal-bold',
                url: '/form/rekon-intech',
                isPro: false,
            },
            {
                id: 'pages-rekon-lensa',
                name: 'Rekon Lensa',
                icon: 'solar:glasses-linear',
                iconActive: 'solar:glasses-bold',
                url: '/form/rekon-lensa',
                isPro: false,
            },
            {
                id: 'pages-return-material',
                name: 'Return Material',
                icon: 'solar:restart-square-linear',
                iconActive: 'solar:restart-square-bold',
                url: '/form/return-material',
                isPro: false,
            },
            {
                id: 'pages-stock-opname',
                name: 'Stock Opname',
                icon: 'solar:clipboard-list-linear',
                iconActive: 'solar:clipboard-list-bold',
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
                iconActive: 'solar:tag-bold',
                url: '/apps/inout-tag',
                isPro: false,
            },
            {
                id: 'apps-out-material',
                name: 'Out Material',
                icon: 'solar:delivery-linear',
                iconActive: 'solar:delivery-bold',
                url: '/apps/out-material',
                isPro: false,
            },
            {
                id: 'apps-hasil-rekon',
                name: 'Hasil Rekon',
                icon: 'solar:document-text-linear',
                iconActive: 'solar:document-text-bold',
                url: '/apps/hasil-rekon',
                isPro: false,
            },
            {
                id: 'apps-stock-movement',
                name: 'Stock Movement',
                icon: 'solar:history-linear',
                iconActive: 'solar:history-bold',
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
                iconActive: 'solar:user-circle-bold',
                url: '/management/user-profile',
                isPro: false,
            },
            {
                id: 'mgmt-users',
                name: 'Users',
                icon: 'solar:users-group-rounded-linear',
                iconActive: 'solar:users-group-rounded-bold',
                url: '/management/users',
                isPro: false,
            },
            {
                id: 'mgmt-technician',
                name: 'Technicians',
                icon: 'solar:shield-user-linear',
                iconActive: 'solar:shield-user-bold',
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
                icon: 'solar:export-linear',
                iconActive: 'solar:export-bold',
                url: '/reference/out-lensa-ref',
                isPro: false,
            },
            {
                id: 'ref-wo-lensa-ref',
                name: 'WO Lensa Ref',
                icon: 'solar:notebook-linear',
                iconActive: 'solar:notebook-bold',
                url: '/reference/wo-lensa-ref',
                isPro: false,
            },
            {
                id: 'ref-stock-comparison',
                name: 'Intech Lensa Vs MTMS',
                icon: 'solar:scale-linear',
                iconActive: 'solar:scale-bold',
                url: '/reference/stock-comparison',
                isPro: false,
            },
        ],
    },
];

export default SidebarContent;
