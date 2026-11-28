#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright';
import { z } from 'zod';

const SCREENSHOT_DIR = '/Users/imfard90/Documents/project/Digital-Support/public/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const server = new McpServer(
    { name: 'playwright-sneat-inspector', version: '1.0.0' },
    {
        instructions:
            'Playwright automation tool to inspect and screenshot live Sneat Next.js demo pages (e.g. dashboards/crm, dashboards/analytics).',
    }
);

async function getAuthenticatedPage(route: string) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Navigate to login
    await page.goto(
        'https://demos.themeselection.com/sneat-mui-nextjs-admin-template/demo-1/en/login',
        { waitUntil: 'networkidle', timeout: 30000 }
    );

    // Click Login if on login page
    if (page.url().includes('/login')) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
            page.click('button:has-text("Login")'),
        ]);
    }

    // Clean route
    const targetRoute = route.startsWith('/') ? route.slice(1) : route;
    const targetUrl = `https://demos.themeselection.com/sneat-mui-nextjs-admin-template/demo-1/en/${targetRoute}`;

    if (!page.url().includes(targetRoute)) {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    }

    return { browser, page };
}

server.registerTool(
    'capture_sneat_demo',
    {
        description:
            'Capture full-page screenshot of a Sneat Next.js demo page (e.g., "dashboards/crm", "dashboards/analytics", "dashboards/ecommerce").',
        inputSchema: {
            route: z
                .string()
                .default('dashboards/crm')
                .describe('The route to inspect, e.g. "dashboards/crm"'),
            fullPage: z.boolean().default(true).describe('Whether to capture full scrollable page'),
        },
    },
    async ({ route, fullPage }) => {
        const { browser, page } = await getAuthenticatedPage(route);

        const safeSlug = route.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `sneat-${safeSlug}.png`;
        const filePath = path.join(SCREENSHOT_DIR, filename);

        await page.screenshot({ path: filePath, fullPage });
        const title = await page.title();

        const cards = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.MuiCard-root')).map((c) => {
                const header = c.querySelector('.MuiCardHeader-title')?.textContent?.trim() || '';
                const subheader =
                    c.querySelector('.MuiCardHeader-subheader')?.textContent?.trim() || '';
                return { header, subheader };
            });
        });

        await browser.close();

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            status: 'success',
                            pageTitle: title,
                            screenshotSavedAt: filePath,
                            url: `http://localhost:3000/screenshots/${filename}`,
                            cardsCount: cards.length,
                            cardsSample: cards.slice(0, 10),
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }
);

server.registerTool(
    'inspect_sneat_dom',
    {
        description: 'Extract headings, cards, and navigation links from a Sneat demo page.',
        inputSchema: {
            route: z
                .string()
                .default('dashboards/crm')
                .describe('The route to inspect, e.g. "dashboards/crm"'),
        },
    },
    async ({ route }) => {
        const { browser, page } = await getAuthenticatedPage(route);

        const data = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.MuiCard-root')).map((c) => {
                const header = c.querySelector('.MuiCardHeader-title')?.textContent?.trim() || '';
                const subheader =
                    c.querySelector('.MuiCardHeader-subheader')?.textContent?.trim() || '';
                const preview = c.textContent?.trim().slice(0, 120) || '';
                return { header, subheader, preview };
            });

            const navLinks = Array.from(document.querySelectorAll('nav a, [class*="menu"] a'))
                .map((a) => ({
                    text: a.textContent?.trim() || '',
                    href: a.getAttribute('href') || '',
                }))
                .filter((a) => a.text && a.href && a.href.includes('dashboard'));

            return { cards, navLinks };
        });

        await browser.close();

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

await server.connect(new StdioServerTransport());
