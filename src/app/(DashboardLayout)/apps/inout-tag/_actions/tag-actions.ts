/**
 * Barrel re-export - tag-actions.ts
 *
 * Split for maintainability (M2 audit fix):
 *   - tag-queries.ts      - read-only DB queries for main tag list
 *   - tag-item-queries.ts - read-only DB queries for tag items and filters
 *   - tag-commands.ts     - write operations with use server (4 functions)
 *
 * Import path ../_actions/tag-actions remains unchanged for consumers.
 */

export {
    acceptReturnTag,
    cancelTag,
    createTag,
    updateTag,
} from './tag-commands';

export {
    getInOutTagFilterOptions,
    getInOutTagItems,
    getInoutTagItemsByHeaderId,
    getMaterials,
    getMaterialsWithStock,
    getReturnMaterialItemsByHeaderId,
    getWarehouses,
} from './tag-item-queries';
export {
    getInOutTags,
    getInOutTagsPaginated,
} from './tag-queries';
