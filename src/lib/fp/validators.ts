/**
 * Pure validation functions for business rules
 * These can be used in components, server actions, or stored procedures validation
 */

/**
 * Status transition validator
 * Returns true if transition from -> to is allowed
 */
export const isValidStatusTransition = <S extends string>(
    from: S,
    to: S,
    validTransitions: Record<S, readonly S[]>
): boolean => {
    const allowed = validTransitions[from];
    return allowed?.includes(to) ?? false;
};

/**
 * Warehouse branch validator
 * Returns true if warehouse is internal (same branch as current user)
 */
export const isInternalWarehouse = (
    warehouse: { branch: string },
    currentUserBranch: string
): boolean => warehouse.branch === currentUserBranch;

/**
 * Stock availability check
 * Returns true if requested quantity is available
 */
export const hasEnoughStock = (currentStock: number, requestedQty: number): boolean =>
    currentStock >= requestedQty;

/**
 * Positive quantity check
 */
export const isPositiveQuantity = (qty: number): boolean =>
    typeof qty === 'number' && qty > 0 && Number.isFinite(qty);

/**
 * Valid currency amount
 */
export const isValidAmount = (amount: number): boolean =>
    typeof amount === 'number' && amount >= 0 && Number.isFinite(amount);

/**
 * Valid email
 */
export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Valid UUID
 */
export const isValidUUID = (id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
};

/**
 * Valid Indonesian phone number
 */
export const isValidPhoneID = (phone: string): boolean => {
    const phoneRegex = /^(\+62|62|0)8[0-9]{8,11}$/;
    return phoneRegex.test(phone.replace(/[\s-]/g, ''));
};

/**
 * Date range validator
 * Returns true if from <= to
 */
export const isValidDateRange = (from: Date, to: Date): boolean => from.getTime() <= to.getTime();

/**
 * Not empty string
 */
export const isNotEmpty = (str: string | null | undefined): boolean =>
    typeof str === 'string' && str.trim().length > 0;

/**
 * MTMS InOut Tag valid status transitions
 */
export const INOUT_TAG_TRANSITIONS = {
    OPEN: ['IN_TRANSIT', 'CANCEL'],
    IN_TRANSIT: ['CLOSED', 'CANCEL'],
    CLOSED: [], // Terminal
    CANCEL: [], // Terminal
} as const;

/**
 * MTMS Out SAP valid status transitions
 */
export const OUT_SAP_TRANSITIONS = {
    REQUESTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['COMPLETED'],
    REJECTED: [], // Terminal
    COMPLETED: [], // Terminal
} as const;

/**
 * MTMS Return Material valid status transitions
 */
export const RETURN_MATERIAL_TRANSITIONS = {
    REQUESTED: ['IN_TRANSIT', 'CANCEL'],
    IN_TRANSIT: ['ACCEPTED', 'CANCEL'],
    ACCEPTED: [], // Terminal
    CANCEL: [], // Terminal
} as const;
