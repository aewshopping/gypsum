/**
 * Translates a KeyboardEvent into a popup command object.
 * Pure function — no side effects, no DOM mutations.
 * @param {KeyboardEvent} evt
 * @param {HTMLElement} popup
 * @returns {{ action: 'select'|'move'|'dismiss'|'none', direction?: 'next'|'prev', tag?: string }}
 */
export function handlePopupKeydown(evt, popup) {
    const active = popup.querySelector('[data-active="true"]');

    if (evt.key === 'Escape') return { action: 'dismiss' };

    if (evt.key === 'ArrowDown') return { action: 'move', direction: 'next' };
    if (evt.key === 'ArrowUp')   return { action: 'move', direction: 'prev' };

    if (evt.key === 'Tab') {
        if (active) return { action: 'select', tag: active.dataset.tag };
        return { action: 'move', direction: 'next' };
    }

    if (evt.key === 'Enter' && active) {
        return { action: 'select', tag: active.dataset.tag };
    }

    return { action: 'none' };
}
