/**
 * Canonical MUNI legal documents, shared by the mobile app and the website so
 * there is only ever one version of each.
 *
 * Consumed as:
 *   • mobile  — `@legal` (metro.config.js extraNodeModules + tsconfig paths)
 *   • website — `@legal` (vite.config.ts alias + tsconfig paths)
 *
 * Keep this module dependency-free. See ./types.ts for why.
 */

export type { LegalSection, LegalDocumentContent } from './types';
export { TERMS_CONTENT } from './terms';
export { PRIVACY_CONTENT } from './privacy';
