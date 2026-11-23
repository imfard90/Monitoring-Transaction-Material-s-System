import { addCollection, type IconifyJSON } from '@iconify/react';
import bundledCollections from './bundled-icons.json';

// Fingerprint versi bundle icon lokal berdasarkan prefix dan jumlah icon
const ICON_VERSION_FINGERPRINT = bundledCollections
    .map((c) => `${c.prefix}:${Object.keys(c.icons || {}).length}`)
    .join('-');
const STORAGE_KEY = `mtms_static_icons_${ICON_VERSION_FINGERPRINT}`;

let isRegistered = false;

/**
 * Registers locally bundled icons into Iconify storage.
 * Synchronizes with browser localStorage so static icon data is retained locally
 * until the user explicitly clears browser cache.
 * Eliminates runtime HTTP fetches to api.iconify.design and satisfies CSP.
 */
export function registerBundledIcons(): void {
    if (isRegistered) {
        return;
    }

    // 1. Coba baca dari cache localStorage di browser jika tersedia
    if (typeof window !== 'undefined') {
        try {
            // Bersihkan versi cache icon lama jika bundle telah diperbarui
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key?.startsWith('mtms_static_icons_') && key !== STORAGE_KEY) {
                    localStorage.removeItem(key);
                }
            }

            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached) as IconifyJSON[];
                for (const col of parsed) {
                    addCollection(col);
                }
                isRegistered = true;
                return;
            }
        } catch {
            // Fallback graceful jika storage bermasalah
        }
    }

    // 2. Daftarkan dari bundle lokal
    for (const collection of bundledCollections) {
        addCollection(collection as unknown as IconifyJSON);
    }

    // 3. Simpan ke localStorage browser agar bertahan sampai user membersihkan cache
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(bundledCollections));
        } catch {
            // Abaikan jika quota penyimpanan terbatas
        }
    }

    isRegistered = true;
}

// Auto-register upon import
registerBundledIcons();



