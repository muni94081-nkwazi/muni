import type { LegalDocumentContent } from './types';

/**
 * MUNI Terms & Conditions — the single source used by both the mobile app
 * (app/terms.tsx) and the website (/conditions).
 *
 * Written against what this codebase actually does. In particular:
 *
 *   • Payment methods name only the drivers that exist in payment-service:
 *     MTN MoMo, Airtel Money and card payments, plus the Flutterwave and
 *     Pesapal aggregator webhooks. Nothing else is claimed.
 *   • Returns and disputes describe return-service and dispute-service, which
 *     are real, without promising a specific window — that is business policy
 *     and is left as a placeholder.
 *   • Commission is described as charged to sellers but the rate is a
 *     placeholder, because no rate is fixed anywhere in this repository.
 *
 * Business details that do not exist in the codebase are `[BRACKETED]`
 * placeholders rather than invented. Have a qualified lawyer review before
 * publishing.
 */
export const TERMS_CONTENT: LegalDocumentContent = {
  title: 'Terms & Conditions',
  effective: 'Last updated: [EFFECTIVE DATE]',
  intro:
    'MUNI is an online marketplace. We provide the platform; the products are sold by independent sellers. These terms explain what you can expect from us, what we expect from you, and who is responsible when something goes wrong.',
  sections: [
    {
      heading: 'Accepting these terms',
      body: [
        'These terms are an agreement between you and [COMPANY NAME] ("MUNI", "we", "us"), registered at [REGISTERED ADDRESS].',
        'By creating an account, placing an order, or otherwise using MUNI, you accept these terms. If you do not accept them, please do not use the service.',
        'If you use MUNI on behalf of a business, you confirm you are authorised to accept these terms for that business.',
      ],
    },
    {
      heading: 'What MUNI is — and is not',
      body: [
        'MUNI is a marketplace. Sellers list their own products, set their own prices, and are responsible for supplying what they sell.',
        'Unless a listing states that MUNI is the seller, your purchase contract is with the seller, not with MUNI. We are not the manufacturer, importer or retailer of seller-listed goods.',
        'We provide the platform, process payments, and offer the order, delivery, returns and dispute tools described below.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'You need an account to buy, sell, save items or message other users. You must give accurate details and keep them up to date.',
        'You are responsible for activity on your account. Keep your password private, and tell us promptly if you think someone else has access.',
        'Two-factor authentication is available to every account, and is required for seller and administrator accounts.',
        'You must be old enough to enter a contract where you live. MUNI is not intended for children.',
      ],
    },
    {
      heading: 'If you are a customer',
      body: ['When you shop on MUNI you agree to:'],
      bullets: [
        'Give accurate delivery details, and be reachable on the contact number you provide.',
        'Pay for what you order using a payment method you are entitled to use.',
        'Accept or collect deliveries within a reasonable time.',
        'Use products lawfully and follow any instructions or age restrictions on a listing.',
        'Raise problems through the returns and disputes tools rather than by chargeback in the first instance, so the seller has a chance to put things right.',
      ],
    },
    {
      heading: 'If you are a seller',
      body: [
        'Sellers are independent businesses or individuals. Selling on MUNI requires a verified seller account, and we may ask for identification, business registration, tax or bank documents before or after approval.',
        'As a seller you agree to:',
      ],
      bullets: [
        'Only list products you are legally entitled to sell, and hold any licence or permit the law requires.',
        'Describe products accurately, including condition, materials, size, compatibility and what is in the box.',
        'Keep stock levels current and fulfil orders you accept, within the dispatch time shown.',
        'Honour the returns, refund and warranty rights customers have by law.',
        'Respond to customer messages, questions and disputes within a reasonable time.',
        'Keep your payout and tax details accurate, and pay any tax you owe.',
        'Not manipulate reviews, search ranking, stock or pricing.',
      ],
    },
    {
      heading: 'Product listings',
      body: [
        'Listings are created by sellers and may be reviewed before they appear. Approval is not an endorsement, and does not mean we have verified every claim.',
        'We may edit, re-categorise, hide or remove a listing that breaks these terms, the marketplace rules, or the law — including while we investigate a report.',
        'You may not list prohibited items. These include counterfeit or stolen goods, unsafe or recalled products, weapons, illegal drugs, live animals, human remains or fluids, hazardous materials, and anything whose sale is restricted where the buyer or seller is located.',
      ],
    },
    {
      heading: 'Descriptions, prices and availability',
      body: [
        'Sellers set prices and are responsible for their accuracy, including tax and any delivery charge shown separately at checkout.',
        'We try to keep listings accurate, but errors happen. If a product is mispriced or unavailable, the order may be cancelled and you will be refunded in full — we will not charge you a price you did not agree to.',
        'Images are illustrative. Colours can differ between screens, and packaging can change.',
        'A price shown as reduced compares against the seller’s own earlier price, not against another retailer.',
      ],
    },
    {
      heading: 'Orders',
      body: [
        'Placing an order is an offer to buy. A contract forms when the seller accepts it, which is normally when the order is confirmed or dispatched.',
        'We reserve stock while an order is being paid for. If payment does not complete, the reservation is released and the items may sell to someone else.',
        'An order may be declined or cancelled if a product is unavailable, if payment fails, if details cannot be verified, or if we suspect fraud or a breach of these terms.',
        'You can view your orders and their status in your account at any time.',
      ],
    },
    {
      heading: 'Payments',
      body: [
        'MUNI supports mobile money through MTN MoMo and Airtel Money, and card payments. Some payments are processed through payment aggregators, currently including Flutterwave and Pesapal.',
        'Payments are handled by these providers. We do not store your full card number or your mobile money PIN.',
        'Prices may be displayed in a currency you choose. Display currency is a convenience — the amount actually charged is in the currency the seller sells in, and your bank or mobile money provider may apply its own conversion or fees.',
        'If a payment is reversed, charged back or fails after an order is placed, we may cancel the order and recover the amount owed.',
      ],
    },
    {
      heading: 'Shipping and delivery',
      body: [
        'Delivery is arranged by the seller or by a delivery partner. Delivery times shown are estimates, not guarantees, and can be affected by weather, traffic, customs and public holidays.',
        'Some orders can be collected from a pickup station instead of being delivered to an address.',
        'You must give a delivery address and contact number that can actually receive the order. If a delivery fails because the details were wrong or nobody was reachable, a further delivery charge may apply.',
        'Risk in the goods passes to you on delivery, or on collection where you collect them.',
      ],
    },
    {
      heading: 'Returns, refunds and cancellations',
      body: [
        'You can request a return from the order in your account. The return window is [RETURN WINDOW] for eligible items.',
        'Items must normally be unused and in their original packaging, with anything that came with them. Some items cannot be returned once opened — including perishable goods, personal care and hygiene products, and made-to-order or personalised items — except where they are faulty.',
        'Faulty, damaged or wrongly supplied items can be returned regardless of the window, and nothing in these terms limits the rights the law gives you.',
        'Approved refunds are returned to the original payment method. The time it takes to appear depends on your bank or mobile money provider.',
      ],
    },
    {
      heading: 'Reviews, questions and other content',
      body: [
        'You can review products you bought, ask sellers questions, and message sellers. Keep it honest, relevant and civil.',
        'Do not post content that is false, abusive, hateful, obscene, threatening, or that reveals someone else’s personal information. Do not post reviews you were paid or rewarded to write, and do not review your own products.',
        'You keep ownership of what you post, and you give MUNI a non-exclusive, royalty-free licence to host, display and distribute it in connection with the marketplace.',
        'We may remove content that breaks these rules, and may suspend accounts that repeatedly do so.',
      ],
    },
    {
      heading: 'Things you must not do',
      body: ['When using MUNI, you must not:'],
      bullets: [
        'Break the law, or help anyone else to.',
        'Impersonate someone, or open an account under false details.',
        'Interfere with the platform, probe it for weaknesses, or try to reach data or accounts that are not yours.',
        'Scrape, harvest or bulk-copy listings, prices, reviews or user details.',
        'Take payment or arrange a sale off-platform to avoid fees or protections.',
        'Manipulate reviews, ratings, search ranking or stock.',
        'Upload malware, or use the platform to send spam.',
      ],
    },
    {
      heading: 'Seller fees and commission',
      body: [
        'Selling on MUNI is subject to a commission on completed sales, currently [COMMISSION RATE], and to any other fees set out in the seller agreement at [SELLER FEE SCHEDULE].',
        'Commission and applicable fees are deducted before payout. Payouts are made to the bank or mobile money details on your seller profile, on the schedule described in the seller agreement.',
        'We will give reasonable notice before changing fees. Buying on MUNI is free — customers pay the price shown plus any delivery charge and tax.',
      ],
    },
    {
      heading: 'Intellectual property',
      body: [
        'The MUNI name, logo, design and software belong to [COMPANY NAME] or its licensors. You may not copy or reuse them without written permission.',
        'Sellers keep the rights in their own brands, images and listing content, and confirm they are entitled to use everything they upload.',
        'If you believe content on MUNI infringes your rights, contact [LEGAL EMAIL] with enough detail to identify the content and your rights in it. We may remove content while we look into it, and may suspend repeat infringers.',
      ],
    },
    {
      heading: 'Suspending or closing an account',
      body: [
        'You can stop using MUNI at any time, and can ask us to delete your account as described in the Privacy Policy.',
        'We may suspend or close an account, or remove listings, if these terms or the marketplace rules are broken, if we are required to by law, or if we reasonably suspect fraud or a risk to other users.',
        'Where it is reasonable and lawful to do so, we will tell you why and give you a chance to respond. Closing an account does not cancel obligations already incurred — orders in progress, refunds owed, or fees due.',
      ],
    },
    {
      heading: 'Our responsibility to you',
      body: [
        'We provide the marketplace with reasonable care and skill, but we do not promise it will always be available or error-free.',
        'Because sellers are independent, we are not responsible for the quality, safety, legality or description of their products, beyond the responsibilities the law places on a marketplace and the protections described in these terms.',
        'We are not liable for indirect or consequential loss, or for loss of profit, revenue, data or goodwill. Where we are liable, our liability to you is limited to the amount you paid for the order the claim relates to.',
        'Nothing here excludes liability that cannot be excluded by law — including for death or personal injury caused by negligence, for fraud, or for your rights as a consumer.',
      ],
    },
    {
      heading: 'Problems and disputes',
      body: [
        'If something is wrong with an order, start with the seller — most issues are resolved fastest that way. You can message a seller, or open a return or dispute from the order in your account.',
        'If it is not resolved, you can escalate the dispute to MUNI. We will look at what both sides provide and reach a decision. We may hold or reverse a payment while a dispute is open.',
        'These terms are governed by the laws of [GOVERNING LAW], and the courts of [JURISDICTION] have jurisdiction. This does not remove any protection you have under the consumer law of the country you live in.',
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        'We may update these terms as the marketplace or the law changes. The date at the top shows when they were last revised.',
        'If a change materially affects you, we will give notice in the app or by email before it takes effect. Continuing to use MUNI after that means you accept the updated terms.',
      ],
    },
    {
      heading: 'Contact',
      body: [
        'For help with an order, use the order in your account or message the seller.',
        'For anything else: [SUPPORT EMAIL]. For legal notices: [LEGAL EMAIL], [COMPANY NAME], [REGISTERED ADDRESS].',
      ],
    },
  ],
  footer:
    'These terms should be reviewed by a qualified legal professional, and the bracketed details completed, before they are published.',
};
