const http = require('http');

const pages = [
    '/',
    '/stock-intech',
    '/stock-inventory',
    '/apps/inout-tag',
    '/apps/out-sap',
    '/apps/return-material',
    '/apps/out-material',
    '/apps/stock-movement',
    '/apps/rekon-intech',
    '/apps/hasil-rekon',
    '/apps/out-lensa-ref',
    '/apps/wo-lensa-ref',
    '/management/users',
    '/management/technician',
    '/user-profile',
];

async function testPage(path) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:3000${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    console.log(`✅ ${path} - ${res.statusCode}`);
                    resolve(true);
                } else {
                    console.log(`❌ ${path} - ${res.statusCode}`);
                    // Check if it's a Next.js error page
                    if (data.includes('Error:')) {
                        const match = data.match(/Error: [^<]+/);
                        if (match) console.log(`   ${match[0]}`);
                    }
                    resolve(false);
                }
            });
        });
        req.on('error', (e) => {
            console.log(`❌ ${path} - Request failed: ${e.message}`);
            resolve(false);
        });
        req.end();
    });
}

async function run() {
    console.log('Testing pages...');
    let allPassed = true;
    for (const page of pages) {
        const passed = await testPage(page);
        if (!passed) allPassed = false;
    }
    console.log(allPassed ? '\nAll pages loaded successfully!' : '\nSome pages failed.');
}

run();
