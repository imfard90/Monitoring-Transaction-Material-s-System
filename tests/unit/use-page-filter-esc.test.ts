import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldHandlePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';

describe('shouldHandlePageFilterEsc predicate logic', () => {
    let mockQuerySelector: any;
    let mockActiveElement: any;

    beforeEach(() => {
        mockActiveElement = null;
        mockQuerySelector = vi.fn().mockReturnValue(null);

        vi.stubGlobal('document', {
            get activeElement() {
                return mockActiveElement;
            },
            querySelector: mockQuerySelector,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns true when Escape is pressed and filters are active with no modals or active form inputs', () => {
        const result = shouldHandlePageFilterEsc({ key: 'Escape' }, true);
        expect(result).toBe(true);
    });

    it('returns false when a key other than Escape is pressed', () => {
        expect(shouldHandlePageFilterEsc({ key: 'Enter' }, true)).toBe(false);
        expect(shouldHandlePageFilterEsc({ key: 'Backspace' }, true)).toBe(false);
        expect(shouldHandlePageFilterEsc({ key: 'a' }, true)).toBe(false);
    });

    it('returns false when no filters are active (isActive is false)', () => {
        const result = shouldHandlePageFilterEsc({ key: 'Escape' }, false);
        expect(result).toBe(false);
    });

    it('returns false when a modal, dialog, popover, or command menu is open in DOM (A2 requirement)', () => {
        mockQuerySelector.mockImplementation((selector: string) => {
            if (selector.includes('[role="dialog"]')) {
                return { tagName: 'DIV' };
            }
            return null;
        });

        const result = shouldHandlePageFilterEsc({ key: 'Escape' }, true);
        expect(result).toBe(false);
    });

    it('returns false when a textarea is currently focused', () => {
        mockActiveElement = {
            tagName: 'TEXTAREA',
        };

        const result = shouldHandlePageFilterEsc({ key: 'Escape' }, true);
        expect(result).toBe(false);
    });

    it('returns false when a password input is currently focused', () => {
        mockActiveElement = {
            tagName: 'INPUT',
            getAttribute: (attr: string) => (attr === 'type' ? 'password' : null),
        };

        const result = shouldHandlePageFilterEsc({ key: 'Escape' }, true);
        expect(result).toBe(false);
    });

    it('returns false when an editable element (contentEditable) is currently focused', () => {
        mockActiveElement = {
            tagName: 'DIV',
            isContentEditable: true,
        };

        const result = shouldHandlePageFilterEsc({ key: 'Escape' }, true);
        expect(result).toBe(false);
    });

    it('returns true when an unfocused table or regular body element is active', () => {
        mockActiveElement = {
            tagName: 'BODY',
        };

        const result = shouldHandlePageFilterEsc({ key: 'Escape' }, true);
        expect(result).toBe(true);
    });
});
