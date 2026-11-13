#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(projectRoot, '.env');

// Read GITHUB_PERSONAL_ACCESS_TOKEN from .env if not present in process.env
let githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!githubToken && fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    githubToken = parsed.GITHUB_PERSONAL_ACCESS_TOKEN;
}

if (!githubToken) {
    console.error(
        '[github-mcp] Error: GITHUB_PERSONAL_ACCESS_TOKEN is not defined in process.env or .env file.'
    );
    process.exit(1);
}

const child = spawn('npx', ['-y', '@modelcontextprotocol/server-github'], {
    env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
    },
    stdio: 'inherit',
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
