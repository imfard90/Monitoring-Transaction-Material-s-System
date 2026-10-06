const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, 'src/app/components/dashboard/TopCards.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    /onlineUsers: 0,[\s\S]*?zeroStockItems: 0,/,
    `onlineUsers: 0,
              requestTag: 0,
              transitTag: 0,
              closeTag: 0,
              returnTek: 0,
              intechOpen: 0,
              intechClose: 0,`
);

fs.writeFileSync(filePath, content);
