import path from 'node:path';
import { google, type sheets_v4 } from 'googleapis';
import { z } from 'zod';

const spreadsheetId = '1-oFsEmoyLk6VuVxQVKerB6235-kkaXNTndVWkCRAF6c';
const maxRowsPerRequest = 250;
const cellRangeSchema = z
    .string()
    .min(1)
    .max(500)
    .regex(/^!?[^!]+![A-Z]{1,3}\d{1,7}:[A-Z]{1,3}\d{1,7}$/i);
const updateSchema = z.object({
    range: cellRangeSchema,
    values: z
        .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
        .min(1)
        .max(maxRowsPerRequest),
    valueInputOption: z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED'),
});

function createSheetsClient(scopes: string[]): sheets_v4.Resource$Spreadsheets {
    const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialPath) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not configured.');
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: path.resolve(credentialPath),
        scopes,
    });
    return google.sheets({ version: 'v4', auth }).spreadsheets;
}

function validateBoundedRange(input: string): string {
    const parsed = cellRangeSchema.safeParse(input);
    if (!parsed.success) {
        throw new Error('Use a bounded A1 range with a sheet name, e.g. Sheet1!A1:B20.');
    }
    const cells = input.split('!').at(-1)?.split(':') ?? [];
    const firstRow = Number(cells[0]?.match(/\d+/)?.[0]);
    const lastRow = Number(cells[1]?.match(/\d+/)?.[0]);
    if (lastRow < firstRow || lastRow - firstRow + 1 > maxRowsPerRequest) {
        throw new Error(`Range must include 1-${maxRowsPerRequest} rows.`);
    }
    return input;
}

export async function readSheetRange(range: string): Promise<{
    range?: string | null;
    values: (string | number | boolean)[][];
}> {
    const boundedRange = validateBoundedRange(range);
    const sheets = createSheetsClient(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const response = await sheets.values.get({
        spreadsheetId,
        range: boundedRange,
        valueRenderOption: 'FORMATTED_VALUE',
    });
    return {
        range: response.data.range,
        values: response.data.values ?? [],
    };
}

export async function updateSheetRange(input: z.input<typeof updateSchema>): Promise<{
    updatedRange?: string | null;
    updatedRows?: number | null;
    updatedColumns?: number | null;
    updatedCells?: number | null;
}> {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
        throw new Error(
            `Invalid update payload: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`
        );
    }
    const range = validateBoundedRange(parsed.data.range);
    const sheets = createSheetsClient(['https://www.googleapis.com/auth/spreadsheets']);
    const response = await sheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: parsed.data.valueInputOption,
        requestBody: { values: parsed.data.values },
    });
    return {
        updatedRange: response.data.updatedRange,
        updatedRows: response.data.updatedRows,
        updatedColumns: response.data.updatedColumns,
        updatedCells: response.data.updatedCells,
    };
}
