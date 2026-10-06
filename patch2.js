const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/components/dashboard/TopCardsCarousel.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    /interface TopCardsCarouselProps {[\s\S]*?};[\s\S]*?}/,
    `interface TopCardsCarouselProps {
    kpis: {
        onlineUsers: number;
        requestTag: number;
        transitTag: number;
        closeTag: number;
        returnTek: number;
        intechOpen: number;
        intechClose: number;
    };
}`
);

content = content.replace(
    /const kpiConfig = \[[\s\S]*?\] as const;/,
    `const kpiConfig = [
    {
        key: 'onlineUsers',
        title: 'Online Users',
        icon: 'solar:users-group-rounded-linear',
        bgcolor: 'bg-primary/10 dark:bg-primary/10',
        iconColor: 'text-primary',
        url: '#',
    },
    {
        key: 'requestTag',
        title: 'Request Tag',
        icon: 'solar:document-add-linear',
        bgcolor: 'bg-info/10 dark:bg-info/10',
        iconColor: 'text-info',
        url: '/apps/inout-tag',
    },
    {
        key: 'transitTag',
        title: 'Transit Tag',
        icon: 'solar:routing-2-linear',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/apps/inout-tag',
    },
    {
        key: 'closeTag',
        title: 'Close Tag',
        icon: 'solar:check-read-linear',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/apps/inout-tag',
    },
    {
        key: 'returnTek',
        title: 'Return Tek',
        icon: 'solar:refresh-circle-linear',
        bgcolor: 'bg-secondary/10 dark:bg-secondary/10',
        iconColor: 'text-secondary',
        url: '/apps/return-material',
    },
    {
        key: 'intechOpen',
        title: 'Intech Open',
        icon: 'solar:box-linear',
        bgcolor: 'bg-warning/10 dark:bg-warning/10',
        iconColor: 'text-warning',
        url: '/apps/out-sap',
    },
    {
        key: 'intechClose',
        title: 'Intech Close',
        icon: 'solar:check-circle-linear',
        bgcolor: 'bg-success/10 dark:bg-success/10',
        iconColor: 'text-success',
        url: '/apps/out-sap',
    },
] as const;`
);

fs.writeFileSync(filePath, content);
