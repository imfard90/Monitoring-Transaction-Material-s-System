const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, 'src/app/(DashboardLayout)/_actions/dashboard-actions.ts');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    /const data = {[\s\S]*?};/,
    `const data = {
            onlineUsers: 0,
            requestTag: 0,
            transitTag: 0,
            closeTag: 0,
            returnTek: 0,
            intechOpen: 0,
            intechClose: 0,
        };`
);

content = content.replace(
    /\/\/ 1\. Open SAP Out[\s\S]*?\/\/ 4\. Zero Stock Items[\s\S]*?data\.zeroStockItems = Number\(zeroStock\?\.total \|\| 0\);/,
    `// 1. Request Tag
        const requestTag = await db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>\`COUNT(id)\`.as('total'))
            .where('end_status', '=', 'requested')
            .executeTakeFirst();
        data.requestTag = Number(requestTag?.total || 0);

        // 2. Transit Tag
        const transitTag = await db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>\`COUNT(id)\`.as('total'))
            .where('end_status', '=', 'in_transit')
            .executeTakeFirst();
        data.transitTag = Number(transitTag?.total || 0);

        // 3. Close Tag
        const closeTag = await db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>\`COUNT(id)\`.as('total'))
            .where('end_status', '=', 'closed')
            .executeTakeFirst();
        data.closeTag = Number(closeTag?.total || 0);

        // 4. Return Tek
        const returnTek = await db
            .selectFrom('inventory.return_material_header')
            .select(sql<number>\`COUNT(id)\`.as('total'))
            .executeTakeFirst();
        data.returnTek = Number(returnTek?.total || 0);`
);

fs.writeFileSync(filePath, content);
