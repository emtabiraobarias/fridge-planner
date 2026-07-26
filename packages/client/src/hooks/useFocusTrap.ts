'use client';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getTabbable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR));
}

/** Text-entry controls open the on-screen keyboard when focused (see below). */
const TEXT_ENTRY_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

function isTextEntry(node: HTMLElement | undefined): boolean {
  if (!node) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  if (node instanceof HTMLInputElement) {
    return TEXT_ENTRY_INPUT_TYPES.has(node.type);
  }
  return node.isContentEditable;
}

/**
 * Hand-rolled focus trap (research D5/D12 — ~30 lines, zero dependency): while
 * `active`, records the element that had focus, moves focus into `containerRef`'s
 * first tabbable node, cycles Tab/Shift+Tab within that tabbable set so focus
 * never escapes the container, and restores focus to the recorded opener once
 * `active` becomes false (or the component unmounts while still active).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const [first] = getTabbable(container);
    // Focus the panel rather than a text-entry control: auto-focusing an input
    // on a phone springs the on-screen keyboard unbidden and — because iOS zooms
    // toward a focused field — was part of the reported "modal zooms in and never
    // zooms out". Non-text controls (buttons, checkboxes) are still focused
    // directly, so keyboard users land on the first actionable thing. Tab order
    // is unchanged either way, and the panel carries `tabIndex={-1}`.
    (isTextEntry(first) ? container : (first ?? container)).focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Tab' || !container) return;
      const nodes = getTabbable(container);
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (!firstNode || !lastNode) return;

      const withinContainer = container.contains(document.activeElement);
      if (event.shiftKey) {
        if (!withinContainer || document.activeElement === firstNode) {
          event.preventDefault();
          lastNode.focus();
        }
      } else if (!withinContainer || document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
      openerRef.current?.focus();
    };
  }, [active, containerRef]);
}
