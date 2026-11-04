/**
 * Shape of the legal documents shared by the MUNI mobile app and the website.
 *
 * Deliberately dependency-free — no React, no React Native, no imports at all.
 * That is what makes it safe for Metro to bundle from outside the mobile project
 * root: there is no second copy of a runtime library to collide with, only data.
 * Keep it that way.
 */

export interface LegalSection {
  /** Section heading, rendered as a subheading on both platforms. */
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
}

export interface LegalDocumentContent {
  title: string;
  /** Shown under the title, e.g. "Last updated: …". */
  effective: string;
  /** Short plain-language summary before the numbered sections. */
  intro: string;
  sections: LegalSection[];
  /** Closing note, typically how to get in touch. */
  footer: string;
}
