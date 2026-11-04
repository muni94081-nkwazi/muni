import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query from JS, so a component can branch on the
 * same breakpoint its stylesheet uses.
 *
 * The footer needs this because CSS alone cannot fix the accordion's
 * semantics: the mobile layout collapses each column behind a toggle, the
 * desktop layout shows every link permanently, and rendering `aria-expanded`
 * at both widths tells a screen reader on desktop that columns are collapsed
 * while they are plainly visible. Only JS can drop the ARIA on desktop.
 *
 * Returns `false` when `matchMedia` is unavailable (jsdom does not implement
 * it), which makes the always-expanded desktop layout the fallback — the safe
 * one, since every link stays reachable.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const list = window.matchMedia(query);
    // Re-read on subscribe: the viewport may have changed between the initial
    // render and this effect, or `query` itself may have changed.
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    // Safari < 14 exposes only the deprecated addListener/removeListener pair.
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }, [query]);

  return matches;
}

/**
 * The footer's mobile breakpoint. Must stay in sync with the
 * `max-width: 768px` blocks in Footer.module.css — the JS decides whether the
 * headings are accordion controls, the CSS decides whether they look and
 * behave like them.
 */
export const MOBILE_QUERY = '(max-width: 768px)';

/**
 * Set when the reader has asked their OS to reduce motion.
 *
 * Anything that moves on its own — the home carousel is the only one today —
 * must not start when this matches. CSS can shorten a transition, but it
 * cannot stop a timer that advances a slide, so the component has to ask.
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
