const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, 'src/app/components/dashboard/TopCardsCarousel.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Update icons
content = content.replace(
    /'solar:users-group-rounded-linear'/g,
    "'solar:users-group-rounded-bold-duotone'"
);
content = content.replace(/'solar:document-add-linear'/g, "'solar:document-add-bold-duotone'");
content = content.replace(/'solar:routing-2-linear'/g, "'solar:routing-2-bold-duotone'");
content = content.replace(/'solar:check-read-linear'/g, "'solar:check-read-bold-duotone'");
content = content.replace(/'solar:refresh-circle-linear'/g, "'solar:refresh-circle-bold-duotone'");
content = content.replace(/'solar:box-linear'/g, "'solar:box-bold-duotone'");
content = content.replace(/'solar:check-circle-linear'/g, "'solar:check-circle-bold-duotone'");

// Update card height and icon size
content = content.replace(/w-full border-none!`}>/g, 'w-full border-none! py-6`}>');

content = content.replace(
    /width={28}\s*height={28}/g,
    'width={36}\n                                            height={36}'
);

fs.writeFileSync(filePath, content);
