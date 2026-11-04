/**
 * react-test-renderer ships no types and has no @types package installed — it
 * arrives transitively with jest-expo. Declaring it here keeps `tsc --noEmit`
 * green for the component and hook tests, without adding a dependency the app
 * itself does not need.
 *
 * Only the surface those tests use is declared.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface TestRendererJSON {
    type: string;
    props: Record<string, unknown>;
    children: Array<TestRendererJSON | string> | null;
  }

  export interface TestInstance {
    props: Record<string, unknown>;
    type: unknown;
    findAll(predicate: (node: TestInstance) => boolean): TestInstance[];
  }

  export interface TestRenderer {
    unmount(): void;
    toJSON(): TestRendererJSON | TestRendererJSON[] | null;
    root: TestInstance;
  }

  export function create(element: ReactElement): TestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void> | void;
}
