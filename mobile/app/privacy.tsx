import React from 'react';
import { PRIVACY_CONTENT } from '@legal';
import { LegalDocument } from '@/components/LegalDocument';

// ─── Privacy Policy ───────────────────────────────────────────────────────────
//
// Reached from the account screen's guest footer, from Settings → Legal
// policies, from the Delete account screen, and from the consent line on the
// Create account form.
//
// The content itself lives in frontend/shared/legal/privacy.ts and is rendered
// unchanged by the website at /privacy, so there is only one version of this
// document to keep current. The notes there explain which claims are worded
// carefully and why.

export default function PrivacyScreen() {
  return (
    <LegalDocument
      title={PRIVACY_CONTENT.title}
      effective={PRIVACY_CONTENT.effective}
      intro={PRIVACY_CONTENT.intro}
      sections={PRIVACY_CONTENT.sections}
      footer={PRIVACY_CONTENT.footer}
    />
  );
}
