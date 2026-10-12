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
    getInOutTags,
    getInOutTagsPaginated,
} from './tag-queries';

export {
    getInOutTagItems,
    getWarehouses,
    getMaterials,
    getMaterialsWithStock,
    getInoutTagItemsByHeaderId,
    getReturnMaterialItemsByHeaderId,
    getInOutTagFilterOptions,
} from './tag-item-queries';

export {
    createTag,
    updateTag,
    cancelTag,
    acceptReturnTag,
} from './tag-commands';
