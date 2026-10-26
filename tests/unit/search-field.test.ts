import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import { SearchField } from '@/components/ui/search-field';

describe('SearchField Keyboard Escape & Clear Logic', () => {
    it('clears query and stops propagation when Escape is pressed on non-empty value', () => {
        const onValueChange = vi.fn();
        const onClear = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();

        const vnode = SearchField({
            value: 'kabel optik',
            onValueChange,
            onClear,
        });

        // The first child of the wrapper is the Input component
        const children = vnode.props.children;
        const inputElement = children[0];

        expect(inputElement).toBeDefined();
        expect(inputElement.props.value).toBe('kabel optik');

        const escapeEvent = {
            key: 'Escape',
            preventDefault,
            stopPropagation,
        } as unknown as React.KeyboardEvent<HTMLInputElement>;

        inputElement.props.onKeyDown(escapeEvent);

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(onValueChange).toHaveBeenCalledWith('');
        expect(onClear).toHaveBeenCalledOnce();
    });

    it('does not prevent default or stop propagation when Escape is pressed on empty value', () => {
        const onValueChange = vi.fn();
        const onClear = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();

        const vnode = SearchField({
            value: '',
            onValueChange,
            onClear,
        });

        const children = vnode.props.children;
        const inputElement = children[0];

        const escapeEvent = {
            key: 'Escape',
            preventDefault,
            stopPropagation,
        } as unknown as React.KeyboardEvent<HTMLInputElement>;

        inputElement.props.onKeyDown(escapeEvent);

        expect(preventDefault).not.toHaveBeenCalled();
        expect(stopPropagation).not.toHaveBeenCalled();
        expect(onValueChange).not.toHaveBeenCalled();
        expect(onClear).not.toHaveBeenCalled();
    });

    it('calls custom onKeyDown prop if provided', () => {
        const onValueChange = vi.fn();
        const customOnKeyDown = vi.fn();

        const vnode = SearchField({
            value: 'test',
            onValueChange,
            onKeyDown: customOnKeyDown,
        });

        const inputElement = vnode.props.children[0];

        const enterEvent = {
            key: 'Enter',
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLInputElement>;

        inputElement.props.onKeyDown(enterEvent);

        expect(customOnKeyDown).toHaveBeenCalledWith(enterEvent);
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it('renders clear button with title (Esc) hint when value is present and clears on click', () => {
        const onValueChange = vi.fn();
        const onClear = vi.fn();

        const vnode = SearchField({
            value: 'material 123',
            onValueChange,
            onClear,
            clearLabel: 'Hapus filter',
        });

        // Third element is the conditional clear Button when value is truthy
        const clearButton = vnode.props.children[2];
        expect(clearButton).toBeTruthy();
        expect(clearButton.props.title).toBe('Hapus filter (Esc)');
        expect(clearButton.props['aria-label']).toBe('Hapus filter');

        // Trigger click
        clearButton.props.onClick();

        expect(onValueChange).toHaveBeenCalledWith('');
        expect(onClear).toHaveBeenCalledOnce();
    });

    it('does not render clear button when value is empty', () => {
        const onValueChange = vi.fn();

        const vnode = SearchField({
            value: '',
            onValueChange,
        });

        const clearButton = vnode.props.children[2];
        expect(clearButton).toBeFalsy();
    });
});
