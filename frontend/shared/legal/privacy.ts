import type { LegalDocumentContent } from './types';

/**
 * MUNI Privacy Policy — the single source used by both the mobile app
 * (app/privacy.tsx) and the website (/privacy).
 *
 * Every category below is drawn from what this codebase actually stores or
 * calls. Things stated carefully on purpose:
 *
 *   • Named third parties are only those genuinely wired up — Sentry (errors),
 *     Twilio (SMS), Firebase Cloud Messaging (push), Cloudinary (website image
 *     delivery), and the payment providers in payment-service. PostHog appears
 *     as an unused environment variable name only and is therefore NOT named.
 *   • No end-to-end encryption claim. Passwords, reset codes and refresh tokens
 *     are hashed, and provider tokens are encrypted at rest; other stored fields
 *     are not. The website's previous "end-to-end encrypted" wording was wrong.
 *   • Deletion is a REQUEST that is actioned, not an automated erasure. The
 *     in-app GDPR endpoint reports success without touching the database, so
 *     promising automated erasure here would be a claim the system does not
 *     honour.
 *   • Cookies: the site sets a refresh cookie from auth-service and uses local
 *     storage for cart and preferences. There is no cookie-consent banner in the
 *     codebase, so no consented analytics cookies are claimed.
 */
export const PRIVACY_CONTENT: LegalDocumentContent = {
  title: 'Privacy Policy',
  effective: 'Last updated: [EFFECTIVE DATE]',
  intro:
    'This policy explains what personal information MUNI collects, how it is used and shared, how long it is kept, and the choices you have. It applies to customers, sellers and administrators, on both the app and the website.',
  sections: [
    {
      heading: 'Who is responsible for your data',
      body: [
        'MUNI is an online marketplace operated by [COMPANY NAME], registered at [REGISTERED ADDRESS]. [COMPANY NAME] is the data controller for the information described here.',
        'Sellers on MUNI are independent businesses. When a seller uses your details to fulfil an order, they are responsible for their own handling of that information.',
        'For privacy questions or to exercise any right below, contact [PRIVACY EMAIL].',
      ],
    },
    {
      heading: 'Account information',
      body: ['Every account holds:'],
      bullets: [
        'Your name and email address.',
        'Your password, stored only as a cryptographic hash — never in a readable form.',
        'Optionally a phone number and profile picture.',
        'If you sign in with an external provider, the account identifier, email address, display name and avatar that provider returns.',
        'If you enable two-factor authentication, the secret used to verify your codes.',
        'Your account type — customer, seller or administrator.',
      ],
    },
    {
      heading: 'Customer information',
      body: ['If you shop on MUNI we also hold:'],
      bullets: [
        'Delivery addresses and the contact name and phone number for a delivery.',
        'Your orders, their contents, status and history.',
        'Your cart, saved items and wishlists.',
        'Reviews, ratings and questions you post, and messages you exchange with sellers or support.',
        'Returns, refunds and any dispute you open.',
      ],
    },
    {
      heading: 'Seller information',
      body: ['If you sell on MUNI we additionally hold:'],
      bullets: [
        'Business name, contact details and business registration or tax identifiers.',
        'Payout details, including bank or mobile money account information.',
        'Verification documents such as government identification, business registration, tax certificates or bank statements.',
        'Your listings, stock levels, orders, payouts and performance or trust metrics.',
      ],
    },
    {
      heading: 'Orders, payments and delivery',
      body: [
        'We record what you bought, from whom, when, the amount, the currency, and the status of the payment.',
        'Payments are processed by the provider you choose — MTN MoMo, Airtel Money, or a card payment, some routed through the aggregators Flutterwave and Pesapal. Those providers handle your payment credentials directly. We do not receive or store your full card number or your mobile money PIN. We keep a record of the transaction, its reference and its outcome.',
        'Delivery details are shared with the seller and, where used, the delivery partner or pickup station handling your order, so it can reach you.',
        'Where a tax invoice is issued, we keep the records tax law requires.',
      ],
    },
    {
      heading: 'Device and technical information',
      body: [
        'When you use MUNI we record information needed to run and secure the service: the pages and products you view, your device type and app or browser version, an approximate location derived from your network connection, and technical logs of requests.',
        'We record sign-in activity and failed authentication attempts to detect account takeover, fraud and abuse.',
        'If the app or site hits an error, a diagnostic report is sent to our error-monitoring provider, Sentry, so we can fix it. These reports are scrubbed of personal data before they are sent.',
      ],
    },
    {
      heading: 'Cookies and local storage',
      body: [
        'The website sets a cookie that keeps you signed in between visits. It is necessary for the service to work — without it you would have to sign in on every page.',
        'The website also uses your browser’s local storage to remember practical things such as your cart session and your chosen display currency and market.',
        'The mobile app does not use browser cookies. Your session is held in your device’s secure storage, and your preferences in the app’s own storage.',
        'Clearing your browser data, or signing out, removes the stored session. In the app, signing out or clearing app data does the same.',
      ],
    },
    {
      heading: 'How we use your information',
      body: ['We use your data for these purposes and no others without telling you first:'],
      bullets: [
        'Creating and securing your account, including two-factor authentication and detecting suspicious sign-ins.',
        'Processing orders, reserving stock, taking payment, arranging delivery, and handling returns, refunds and disputes.',
        'Verifying seller identity and eligibility, and making payouts.',
        'Showing relevant products, recommendations, trending listings and search results.',
        'Sending messages about orders, deliveries, returns, security and account activity. These are part of the service and are not marketing.',
        'Sending marketing only where you have opted in, which you can withdraw at any time.',
        'Detecting and preventing fraud, abuse and other harm to users or the marketplace.',
        'Meeting legal, tax and accounting obligations, and responding to lawful requests.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'We do not sell your personal information.',
        'We share only what is necessary, and only with:',
      ],
      bullets: [
        'The seller of an item you buy — the delivery name, address and contact number needed to fulfil your order. Sellers must not use it for anything else.',
        'Payment providers, to take payment and issue refunds.',
        'Delivery partners and pickup stations, to complete your order.',
        'Service providers who host or support the platform under contract, including Sentry for error monitoring, Twilio for SMS, Firebase Cloud Messaging for push notifications, and Cloudinary for delivering images on the website.',
        'Authorities or advisers, where the law requires it or to establish, exercise or defend legal claims.',
      ],
    },
    {
      heading: 'What other users can see',
      body: [
        'Reviews, ratings and product questions you post are public, shown with your display name.',
        'Sellers see the order details needed to fulfil what you bought, and the messages you send them.',
        'Your email address, phone number and full address are never shown publicly on the marketplace.',
      ],
    },
    {
      heading: 'Security',
      body: [
        'Passwords are stored as cryptographic hashes and are never held in a readable form. Password reset codes and session refresh tokens are also stored hashed, and tokens obtained from social sign-in providers are encrypted at rest.',
        'Access to production systems is restricted, and administrative actions are recorded in an audit trail.',
        'Two-factor authentication is available to all accounts and required for seller and administrator accounts.',
        'No system is completely secure, and we do not claim your data is end-to-end encrypted. If a breach affects your personal data we will notify you and the relevant authority where the law requires it.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'We keep personal data while your account is open and you are using MUNI.',
        'Some records are kept longer where the law requires — transaction, tax and accounting records in particular — even after an account is closed.',
        'Seller verification documents are retained for the period required by applicable financial and anti-money-laundering rules.',
        'Specific retention periods are set out at [RETENTION SCHEDULE].',
      ],
    },
    {
      heading: 'Your rights',
      body: ['Subject to local law, you can ask us to:'],
      bullets: [
        'Access — give you a copy of the personal data we hold about you.',
        'Correct — fix details that are wrong or incomplete. Most profile fields can be edited directly.',
        'Delete — erase your personal data, where we are not required to keep it.',
        'Restrict or object — limit how we use your data, including objecting to direct marketing.',
        'Portability — provide your data in a machine-readable format.',
        'Withdraw consent — where we rely on consent, withdraw it at any time without affecting processing already carried out.',
      ],
    },
    {
      heading: 'Deleting your account and data',
      body: [
        'You can request deletion of your account and personal data by contacting [PRIVACY EMAIL] from the email address on the account.',
        'We will confirm your identity, action the request, and tell you when it is complete and what has been retained.',
        'Some information must be kept after deletion — records of completed transactions, and anything needed for tax, accounting, fraud prevention or an open dispute. Where data is retained for those reasons it is no longer used to provide the service to you.',
        'Reviews and messages you posted may remain visible in an anonymised form, so that other people’s context is preserved.',
      ],
    },
    {
      heading: 'Children',
      body: [
        'MUNI is not intended for children below the age at which they can consent to online services in their country, and we do not knowingly collect their data.',
        'If you believe a child has given us personal information, contact [PRIVACY EMAIL] and we will remove it.',
      ],
    },
    {
      heading: 'International transfers',
      body: [
        'Your data may be processed outside your country by the service providers named above, who host or support the platform.',
        'Where that happens we take steps to keep it protected to the standard applicable law requires. Details of the safeguards used are available at [TRANSFER SAFEGUARDS].',
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        'We may update this policy as the service or the law changes. The date at the top shows when it was last revised.',
        'Where a change materially affects how we use your data, we will give notice in the app or by email before it takes effect.',
      ],
    },
    {
      heading: 'Contact',
      body: [
        'For privacy questions, or to exercise any right described here: [PRIVACY EMAIL], [COMPANY NAME], [REGISTERED ADDRESS].',
        'You also have the right to complain to your local data protection authority.',
      ],
    },
  ],
  footer:
    'This policy should be reviewed by a qualified legal professional, and the bracketed details completed, before it is published.',
};
