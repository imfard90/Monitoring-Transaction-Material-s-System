import { addCollection, type IconifyJSON } from '@iconify/react';
import bundledCollections from './bundled-icons.json';

let isRegistered = false;

/**
 * Registers locally bundled icons into Iconify memory storage.
 * Eliminates runtime HTTP fetches to api.iconify.design.
 */
export function registerBundledIcons(): void {
    if (isRegistered) {
        return;
    }
    for (const collection of bundledCollections) {
        addCollection(collection as unknown as IconifyJSON);
    }
    isRegistered = true;
}

// Auto-register upon import
registerBundledIcons();


