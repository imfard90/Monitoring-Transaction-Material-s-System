#!/usr/bin/env node
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SPREADSHEET_ID = '1-oFsEmoyLk6VuVxQVKerB6235-kkaXNTndVWkCRAF6c';
const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const MAX_RANGE_ROWS = 250;
const MAX_OUTPUT_CHARS = 50_000;
type ServiceAccount = {
    type: 'service_account';
    client_email: string;
    private_key: string;
    token_uri: string;
};

function envValue(content: string): string | undefined {
    const line = content
        .split(/\r?\n/)
        .find((entry) => /^\s*(?:export\s+)?GOOGLE_APPLICATION_CREDENTIALS\s*=/.test(entry));
    if (!line) return undefined;
    const value = line.replace(/^\s*(?:export\s+)?[^=]+=\s*/, '').trim();
    if (value.length >= 2 && ['"', "'"].includes(value[0]) && value.at(-1) === value[0])
        return value.slice(1, -1);
    return value;
}

async function credentials(): Promise<ServiceAccount> {
    const envFile = path.resolve(process.cwd(), '.env');
    const configured =
        process.env.GOOGLE_APPLICATION_CREDENTIALS ??
        envValue(await readFile(envFile, 'utf8').catch(() => ''));
    if (!configured)
        throw new Error(
            'Set GOOGLE_APPLICATION_CREDENTIALS in the environment or project .env file.'
        );
    const credentialPath = path.resolve(configured.replace(/^~(?=\/)/, homedir()));
    const parsed: unknown = JSON.parse(await readFile(credentialPath, 'utf8'));
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('type' in parsed) ||
        parsed.type !== 'service_account' ||
        !('client_email' in parsed) ||
        typeof parsed.client_email !== 'string' ||
        !('private_key' in parsed) ||
        typeof parsed.private_key !== 'string' ||
        !('token_uri' in parsed) ||
        typeof parsed.token_uri !== 'string'
    ) {
        throw new Error(
            'GOOGLE_APPLICATION_CREDENTIALS must reference a service-account JSON file.'
        );
    }
    return parsed as ServiceAccount;
}

let tokenCache: { token: string; expiresAt: number } | undefined;
async function accessToken(): Promise<string> {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
    const account = await credentials();
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: READONLY_SCOPE, aud: account.token_uri, iat: now, exp: now + 3600 })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const assertion = `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
    const response = await fetch(account.token_uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Google authentication failed (HTTP ${response.status}).`);
    const data: unknown = await response.json();
    if (
        typeof data !== 'object' ||
        data === null ||
        !('access_token' in data) ||
        typeof data.access_token !== 'string' ||
        !('expires_in' in data) ||
        typeof data.expires_in !== 'number'
    )
        throw new Error('Google returned an invalid authentication response.');
    tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return tokenCache.token;
}

async function sheetsGet(url: URL): Promise<unknown> {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${await accessToken()}` },
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
        throw new Error(
            `Sheets API failed (HTTP ${response.status}); check API enablement and spreadsheet sharing.`
        );
    return response.json();
}

const server = new McpServer(
    { name: 'mtms-google-sheets-readonly', version: '1.0.0' },
    {
        instructions:
            'Read-only access to the configured MTMS stock spreadsheet. Tools only list tabs and read bounded ranges; no write operations are available.',
    }
);

server.registerTool(
    'list_sheets',
    {
        description: 'List tab names and dimensions in the configured MTMS Google spreadsheet.',
        inputSchema: {},
    },
    async () => {
        const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`);
        url.searchParams.set(
            'fields',
            'spreadsheetId,properties(title),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))'
        );
        const data = (await sheetsGet(url)) as {
            properties?: { title?: string };
            sheets?: Array<{
                properties?: {
                    sheetId?: number;
                    title?: string;
                    index?: number;
                    gridProperties?: { rowCount?: number; columnCount?: number };
                };
            }>;
        };
        const sheets = (data.sheets ?? []).map(({ properties }) => ({
            id: properties?.sheetId,
            title: properties?.title,
            index: properties?.index,
            rows: properties?.gridProperties?.rowCount,
            columns: properties?.gridProperties?.columnCount,
        }));
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ title: data.properties?.title, sheets }, null, 2),
                },
            ],
        };
    }
);

server.registerTool(
    'read_sheet_range',
    {
        description:
            'Read a bounded A1-notation range from the configured spreadsheet. Maximum 250 rows and 50,000 output characters.',
        inputSchema: {
            range: z
                .string()
                .min(1)
                .max(500)
                .describe("Bounded A1 range, e.g. 'DATA HARI INI!A1:H20'."),
        },
    },
    async ({ range }) => {
        const parts = range.split('!');
        if (parts.length > 2)
            throw new Error('Provide one A1 range, optionally prefixed with a sheet name.');
        const cellRange = parts.at(-1) ?? '';
        if (!/^\$?[A-Z]{1,3}\$?\d{1,7}:\$?[A-Z]{1,3}\$?\d{1,7}$/i.test(cellRange)) {
            throw new Error(
                'Use a bounded range with explicit start and end cells, such as DATA!A1:H20.'
            );
        }
        const [start, end] = cellRange.replaceAll('$', '').split(':');
        const startRow = Number(start.match(/\d+/)?.[0]);
        const endRow = Number(end.match(/\d+/)?.[0]);
        if (endRow < startRow || endRow - startRow + 1 > MAX_RANGE_ROWS)
            throw new Error(`Range must include 1-${MAX_RANGE_ROWS} rows.`);
        const url = new URL(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
        );
        url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
        const result = (await sheetsGet(url)) as {
            range?: string;
            majorDimension?: string;
            values?: unknown[][];
        };
        const text = JSON.stringify(
            {
                range: result.range,
                majorDimension: result.majorDimension,
                values: result.values ?? [],
            },
            null,
            2
        );
        return {
            content: [
                {
                    type: 'text',
                    text:
                        text.length > MAX_OUTPUT_CHARS
                            ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated]`
                            : text,
                },
            ],
        };
    }
);

await server.connect(new StdioServerTransport());
