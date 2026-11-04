import React from 'react';
import { TERMS_CONTENT } from '@legal';
import { LegalDocument } from '@/components/LegalDocument';

// ─── Terms & Conditions ───────────────────────────────────────────────────────
//
// Reached from the account screen's guest footer, from Settings → Legal
// policies, and from the consent line on the Create account form.
//
// The content itself lives in frontend/shared/legal/terms.ts and is rendered
// unchanged by the website at /conditions, so there is only one version of this
// document to keep current. Only the presentation differs between platforms.

export default function TermsScreen() {
  return (
    <LegalDocument
      title={TERMS_CONTENT.title}
      effective={TERMS_CONTENT.effective}
      intro={TERMS_CONTENT.intro}
      sections={TERMS_CONTENT.sections}
      footer={TERMS_CONTENT.footer}
    />
  );
}
