/**
 * Barrel re-export - tag-actions.ts
 *
 * Split for maintainability (M2 audit fix):
 *   - tag-queries.ts  - read-only DB queries (7 functions)
 *   - tag-commands.ts - write operations with use server (4 functions)
 *
 * Import path ../_actions/tag-actions remains unchanged for consumers.
 */
export {
    getInOutTags,
    getInOutTagItems,
    getWarehouses,
    getMaterials,
    getMaterialsWithStock,
    getInoutTagItemsByHeaderId,
    getReturnMaterialItemsByHeaderId,
} from './tag-queries';

export {
    createTag,
    updateTag,
    cancelTag,
    acceptReturnTag,
} from './tag-commands';
