// ============================================================================
// LEGAL DOCUMENTS — DRAFT TEMPLATES. NOT LEGAL ADVICE.
//
// These are professional starting-point drafts for a Cyprus-registered limited
// company operating an EU consumer platform. They MUST be reviewed and adapted
// by a qualified Cyprus lawyer before the app goes live. Placeholders in the
// form [LIKE_THIS] must be filled in.
//
// Versioning: bump a document's `version` whenever its text changes. The app
// stores which version each user accepted; a bump re-prompts them to re-accept,
// so you always have proof of consent to the CURRENT text.
//
// Audience:
//   "customer" — shown to everyone at signup
//   "cleaner"  — the Service Provider Agreement, accepted separately when a
//                user activates the agent/cleaner side
// ============================================================================

export type LegalAudience = "customer" | "cleaner";

export interface LegalDoc {
  id: string;
  title: string;
  version: number;          // bump on any text change -> triggers re-consent
  effectiveDate: string;    // ISO date the version takes effect
  audience: LegalAudience;
  summary: string;          // one-line plain-language gist
  body: string;             // markdown-ish; rendered by the doc viewer
}

// Company / operator placeholders — fill after incorporation.
export const OPERATOR = {
  companyName: "[COMPANY NAME] Ltd",
  regNo: "[COMPANY REGISTRATION NO.]",
  regAddress: "[REGISTERED ADDRESS, Cyprus]",
  email: "[CONTACT EMAIL]",
  dpoEmail: "[DATA PROTECTION CONTACT EMAIL]",
  country: "Republic of Cyprus",
};

const c = OPERATOR;

// ---------------------------------------------------------------------------
// 1. TERMS & CONDITIONS  (customer + general platform terms)
// ---------------------------------------------------------------------------
const TERMS: LegalDoc = {
  id: "terms",
  title: "Terms & Conditions",
  version: 2,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "The rules for using the platform, and the limits of our responsibility.",
  body: `# Terms & Conditions

**DRAFT — pending legal review. Not yet legally binding.**

_Last updated: [DATE]. Operated by ${c.companyName} (Reg. No. ${c.regNo}), ${c.regAddress}, ${c.country} ("we", "us", "the Platform")._

## 1. What we are
1.1 The Platform is an **online marketplace** that connects individuals and businesses who want cleaning services ("Customers") with independent, self-employed cleaning service providers ("Cleaners").

1.2 **We are an intermediary only.** We are not a cleaning company. We do not employ the Cleaners and we do not ourselves provide cleaning services. The cleaning contract is formed **directly between the Customer and the Cleaner**. We are not a party to it.

1.3 Cleaners are **independent self-employed contractors**. They are not our employees, agents, or workers. See the separate Cleaner (Service Provider) Agreement.

## 2. Eligibility & accounts
2.1 You must be at least 18 and legally able to enter contracts.
2.2 You are responsible for the accuracy of your account information and for keeping your login secure.
2.3 You are responsible for all activity under your account.

## 3. Bookings
3.1 A booking request is an offer by the Customer to contract with the selected Cleaner. The contract forms when the Cleaner (or the auto-accept feature acting on the Cleaner's pre-set rules) accepts it.
3.2 Prices are shown before you confirm. The price you pay includes the Cleaner's fee plus our **service fee** (see the pricing shown at checkout).
3.3 You authorise us (or our payment processor) to charge your chosen payment method for confirmed bookings, tips, and applicable fees.

## 4. Cleaning products, tools & equipment
4.1 Unless expressly agreed otherwise in writing for a specific booking, the **Customer must provide all cleaning products, materials, tools, and equipment** reasonably required for the cleaning (for example: detergents, cloths, mop, bucket, vacuum, gloves).
4.2 The Cleaner is **not** required to bring products or equipment unless the Customer's booking is with a Cleaner who expressly offers this.
4.3 The Customer is responsible for ensuring the supplied products and equipment are **adequate, safe, functional, and suitable** for the surfaces and tasks involved.
4.4 **No refund or quality claim** will be accepted where an incomplete, unsatisfactory, or delayed cleaning results wholly or partly from missing, inadequate, unsafe, or unsuitable products, tools, or equipment that the Customer was responsible for providing.
4.5 The Cleaner is not liable for results that could not reasonably be achieved with the products/equipment made available.

## 5. Our role and your acknowledgements
5.1 We do **not** guarantee the quality, safety, legality, timing, or outcome of any cleaning. That is the Cleaner's responsibility.
5.2 We do **not** supervise, direct, or control how a Cleaner performs a job.
5.3 Ratings, reviews, and verification badges are provided for information only and are **not** a warranty by us.
5.4 You are responsible for securing valuables and for providing safe access to the property.

## 6. Payments & service fee
6.1 We (via our payment processor) collect payment from the Customer, deduct our service fee, and remit the balance to the Cleaner.
6.2 Our service fee and commission structure are disclosed in-app and may change on notice, in line with applicable EU Platform-to-Business rules.

## 7. Cancellations & refunds
7.1 Cancellations and refunds are governed by the **Refund & Cancellation Policy**, which forms part of these Terms.

## 8. Prohibited conduct
8.1 No unlawful, abusive, discriminatory, or fraudulent use. No circumventing the Platform to avoid fees. No harassment of Cleaners or Customers.

## 9. Liability (to the extent permitted by law)
9.1 Nothing in these Terms excludes liability that cannot lawfully be excluded (including for death or personal injury caused by negligence, or fraud).
9.2 Subject to 9.1, because we are an intermediary and not the service provider, **we are not liable for the acts, omissions, damage, loss, theft, or injury caused by a Cleaner or a Customer**, or for the quality of any cleaning.
9.3 Subject to 9.1, our total aggregate liability to you arising from the Platform is limited to the total service fees we earned from your bookings in the **3 months** before the event giving rise to the claim.
9.4 We are not liable for indirect or consequential loss.
9.5 _Note: EU/Cyprus consumer law limits how far liability can be excluded against consumers. This clause must be checked by a lawyer._

## 10. Disputes between Customers and Cleaners
10.1 Cleaning quality, damage, and refund disputes are primarily between the Customer and the Cleaner. We may offer a good-faith resolution process (see Refund & Cancellation Policy) but are not obliged to adjudicate and our decision does not create liability for us.

## 11. Suspension & termination
11.1 We may suspend or close accounts that breach these Terms or applicable law.

## 12. Changes
12.1 We may update these Terms. Material changes will be notified in-app and you may be asked to re-accept. Continued use after the effective date means acceptance.

## 13. Governing law
13.1 These Terms are governed by the laws of the ${c.country}. The courts of Cyprus have jurisdiction, without prejudice to mandatory consumer protections in your country of residence.

## 14. Contact
${c.email}
`,
};

// ---------------------------------------------------------------------------
// 2. PRIVACY POLICY (GDPR)
// ---------------------------------------------------------------------------
const PRIVACY: LegalDoc = {
  id: "privacy",
  title: "Privacy Policy",
  version: 1,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "What personal data we collect, why, and your GDPR rights.",
  body: `# Privacy Policy

**DRAFT — pending legal review.**

_Data controller: ${c.companyName}, ${c.regAddress}, ${c.country}. Contact: ${c.dpoEmail}._

This policy explains how we process personal data under the EU General Data Protection Regulation (GDPR) and Cyprus data protection law.

## 1. Data we collect
- **Account data:** name, email, phone, password (hashed).
- **Customer data:** property addresses, booking history, saved payment tokens (we do **not** store full card numbers — see Cookie/Payments), reviews, messages.
- **Cleaner data:** profile, rates, availability, service area, payout details, ratings, and (where required) identity/verification and tax-relevant information.
- **Usage & device data:** app interactions, IP address, device identifiers, cookies/local storage.
- **Location data:** approximate address-based distance for matching (only as needed).

## 2. Why we process it (legal bases)
- **To perform the contract** (create your account, process bookings & payments).
- **Legitimate interests** (platform safety, fraud prevention, service improvement, dispute handling).
- **Legal obligation** (tax, accounting, responding to lawful requests).
- **Consent** (optional marketing, non-essential cookies) — which you may withdraw at any time.

## 3. Sharing
- Between Customer and Cleaner **only as needed** to perform a booking (e.g. first name, approximate location, masked contact).
- With **payment processors** (e.g. JCC / card acquirer) to take payments.
- With **service providers** (hosting, analytics, communications) under data-processing agreements.
- With **authorities** where legally required.
We do **not** sell personal data.

## 4. Cleaners' tax status
Because Cleaners are self-employed, we may be required to collect and, where the law requires, report information relevant to their income and tax obligations. Cleaners are responsible for their own tax and social-insurance filings.

## 5. International transfers
Where data leaves the EEA, we use appropriate safeguards (e.g. Standard Contractual Clauses).

## 6. Retention
We keep personal data only as long as needed for the purposes above and to meet legal (e.g. tax/accounting) retention periods, then delete or anonymise it.

## 7. Your rights (GDPR)
You have the right to access, rectify, erase, restrict, and port your data, to object to certain processing, and to withdraw consent. To exercise these, contact ${c.dpoEmail}. You may also complain to the **Office of the Commissioner for Personal Data Protection (Cyprus)**.

## 8. Security
We use technical and organisational measures to protect your data. No system is perfectly secure; we cannot guarantee absolute security.

## 9. Children
The Platform is not for anyone under 18.

## 10. Changes
We will notify material changes in-app.

Contact: ${c.dpoEmail}
`,
};

// ---------------------------------------------------------------------------
// 3. COOKIE POLICY
// ---------------------------------------------------------------------------
const COOKIES: LegalDoc = {
  id: "cookies",
  title: "Cookie Policy",
  version: 1,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "How we use cookies and local storage, and how to control them.",
  body: `# Cookie Policy

**DRAFT — pending legal review.**

## 1. What we use
- **Strictly necessary** storage (e.g. keeping you logged in, remembering your session and preferences). These are required for the app to function and do not need consent.
- **Functional** storage (e.g. remembering your last-used side, theme).
- **Analytics** (only if enabled) to understand usage — set only with your consent.

This app currently stores data in your browser's **local storage** to run the demo. In production, non-essential cookies/analytics will be set only after you consent.

## 2. Managing cookies
You can clear or block cookies/local storage in your browser settings. Blocking strictly-necessary storage may break core features (e.g. staying logged in).

## 3. Consent
Where required, we ask for your consent to non-essential cookies and you can change your choice at any time.

Contact: ${c.email}
`,
};

// ---------------------------------------------------------------------------
// 4. REFUND & CANCELLATION POLICY
// ---------------------------------------------------------------------------
const REFUND: LegalDoc = {
  id: "refund",
  title: "Refund & Cancellation Policy",
  version: 3,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "When you can cancel, and how refunds are requested and decided.",
  body: `# Refund & Cancellation Policy

**DRAFT — pending legal review.** Forms part of the Terms & Conditions.

## 1. Cancelling a booking
1.1 You may modify a booking for a limited grace period after booking (shown in-app), after which it becomes cancel-only.
1.2 Cancellation charges (if any) depend on how far in advance you cancel and are shown before you confirm a cancellation. Late cancellations may incur a fee to compensate the Cleaner for reserved time.

## 2. Guest-stay (turnaround) cleanings
2.1 If a cleaning was booked for a short-let guest checkout and that guest stay is later cancelled, the cleaning is **not** cancelled automatically. You will be notified so you can decide whether to keep or cancel it. Normal cancellation terms then apply.

## 3. Customer-supplied products & tools
3.1 Unless expressly agreed otherwise for a booking, **the Customer provides all cleaning products, tools, and equipment** required for the job.
3.2 **No refund or quality claim** will be accepted where a cleaning was incomplete, imperfect, or delayed wholly or partly because the products, tools, or equipment the Customer was responsible for providing were **missing, inadequate, unsafe, or unsuitable**.
3.3 You are reminded of this at the time of booking, before payment.

## 4. Refund requests
4.1 If a cleaning was not performed, was materially incomplete, or fell seriously short **for reasons within the Cleaner's control**, you may request a refund **within 24 hours** of the scheduled cleaning, via the app.
4.2 A refund request is **not** an automatic refund. It starts a review.
4.3 We review the request together with the Cleaner's response and any time-stamped photos submitted by either side, and reach a good-faith decision.
4.4 Approved refunds are returned to your original payment method. Timeframes depend on your bank/processor.

## 5. Our role
5.1 We facilitate refunds as an intermediary. The underlying service was provided by the Cleaner, not us. Our handling of a refund request does not make us the provider of the service or liable for it.

## 6. Consumer rights
6.1 Nothing in this policy removes mandatory statutory consumer rights you may have under Cyprus/EU law.

Contact: ${c.email}
`,
};

// ---------------------------------------------------------------------------
// 5. CLEANER (SERVICE PROVIDER) AGREEMENT  — the self-employment terms
// ---------------------------------------------------------------------------
const CLEANER_AGREEMENT: LegalDoc = {
  id: "cleaner_agreement",
  title: "Cleaner (Service Provider) Agreement",
  version: 1,
  effectiveDate: "2026-01-01",
  audience: "cleaner",
  summary: "Your terms as an independent, self-employed service provider using the Platform.",
  body: `# Cleaner (Service Provider) Agreement

**DRAFT — pending legal review. The employment-status position below is the single highest-risk area and MUST be checked by a Cyprus lawyer against the actual working relationship and the EU Platform Work Directive.**

_Between ${c.companyName} ("the Platform") and you, the service provider ("you", "the Cleaner")._

## 1. Independent contractor status
1.1 You provide cleaning services as an **independent, self-employed business**. You are **not** an employee, worker, agent, or partner of the Platform.
1.2 Nothing in this Agreement creates an employment relationship, a partnership, or a joint venture.
1.3 You control **how** you perform your services. You decide **whether, when, and where** to accept jobs, set your own rates within the Platform, and may work for others, including competitors.
1.4 You provide your own equipment and materials unless you agree otherwise directly with a Customer.
1.5 You may (subject to Platform quality rules and any lawful vetting) send a substitute where permitted.

_Reality check for the operator: to support this status, avoid controlling the Cleaner's prices, hours, methods, and discipline. The more the Platform dictates these, the greater the risk a court reclassifies the Cleaner as an employee regardless of this clause._

## 2. Your tax and social-insurance responsibilities
2.1 You are **solely responsible** for:
- registering as self-employed with the Cyprus Tax Department as required;
- declaring and paying your own **income tax**;
- paying your own **social insurance / GESY** contributions;
- issuing any receipts/invoices and keeping records the law requires;
- submitting your own **income statements / tax returns**.
2.2 The Platform does **not** deduct income tax or social insurance from your payouts. Amounts you receive are gross of your personal taxes.
2.3 The Platform may be legally required to report information about payments made to you to the tax authorities, and you consent to such lawful reporting.
2.4 You indemnify the Platform against tax, social-insurance, penalties, or claims arising from your failure to meet these obligations.

## 3. Your responsibilities as a provider
3.1 Perform services with reasonable skill and care and in line with what you agreed with the Customer.
3.2 Comply with applicable law, health & safety, and Platform quality standards.
3.3 Hold your own insurance appropriate to your work (e.g. public liability), where applicable.
3.4 Treat Customers and their property with care. You are responsible for loss or damage you cause.

## 4. Payments to you
4.1 The Platform collects payment from the Customer, deducts its service fee/commission (as disclosed), and remits the balance to you.
4.2 Commission tiers, where offered, are based on **objective, published criteria** and never on protected characteristics.

## 5. Liability & indemnity
5.1 You are responsible for your own acts and omissions. You indemnify the Platform against claims by Customers or third parties arising from your services, including damage, injury, loss, or theft you cause.
5.2 The Platform is an intermediary and is not liable for your services.

## 6. Ratings, conduct & removal
6.1 You agree to Platform community and quality rules. The Platform may suspend or remove you for breach, unlawful conduct, or serious quality/safety issues. This reflects marketplace quality control, not employment supervision.

## 7. Data
7.1 The Platform processes your data under the Privacy Policy, including information relevant to your tax status where legally required.

## 8. Term & termination
8.1 Either party may end this Agreement at any time. Accrued payment obligations survive.

## 9. Governing law
9.1 Governed by the laws of the ${c.country}; the courts of Cyprus have jurisdiction.

## 10. Acknowledgement
By accepting, you confirm you have **read and understood** this Agreement, that you act as an independent self-employed provider, and that you are responsible for your own taxes and social insurance.

Contact: ${c.email}
`,
};

// ---------------------------------------------------------------------------
// 6. ACCEPTABLE USE POLICY  (both sides)
// ---------------------------------------------------------------------------
const ACCEPTABLE_USE: LegalDoc = {
  id: "acceptable_use",
  title: "Acceptable Use Policy",
  version: 1,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "What you may and may not do on the Platform, for everyone's safety.",
  body: `# Acceptable Use Policy

**DRAFT — pending legal review.** Forms part of the Terms & Conditions and applies to **all users** (Customers and Cleaners).

## 1. Purpose
This policy sets the standards of behaviour for everyone using the Platform. Breaching it may lead to warnings, suspension, or removal.

## 2. You must not
2.1 Use the Platform for any **unlawful** purpose, or to facilitate any crime.
2.2 **Discriminate** against or harass anyone on the basis of race, ethnicity, nationality, religion, sex, gender identity, sexual orientation, disability, age, or any other protected characteristic.
2.3 Post or send content that is **abusive, threatening, defamatory, obscene, hateful, or harassing**.
2.4 **Circumvent the Platform** to arrange or pay for cleanings off-platform in order to avoid fees ("disintermediation"), or solicit users to do so.
2.5 Provide **false, misleading, or fraudulent** information (including fake reviews, fake ratings, fake identity, or fake bookings).
2.6 Impersonate any person or misrepresent your affiliation with anyone.
2.7 Upload malware, attempt to gain unauthorised access, scrape, reverse-engineer, or interfere with the Platform's operation or security.
2.8 Request or perform any service that is **not** the cleaning service booked (e.g. childcare, personal care, or anything unsafe or unlawful).
2.9 Bring, request, or store **weapons, illegal drugs, or illegal items** in connection with a booking.
2.10 Use the Platform's contact channels to **spam** or send unsolicited marketing.

## 3. Safety
3.1 Customers must provide a **safe working environment** and safe access to the property.
3.2 Cleaners must work **safely** and stop if a situation is unsafe.
3.3 Report any safety incident, threat, or injury to us immediately.

## 4. Reporting
4.1 Report content or conduct that breaches this policy via the in-app reporting tools or ${c.email}. We operate a **notice-and-action** process (see the Platform Disclosures) and will review reports in good faith.

## 5. Enforcement
5.1 We may remove content, restrict features, suspend, or terminate accounts that breach this policy, taking into account the seriousness of the breach. Serious or repeated breaches, and anything unlawful, may be reported to the authorities.

Contact: ${c.email}
`,
};

// ---------------------------------------------------------------------------
// 7. COMMUNITY GUIDELINES  (both sides)
// ---------------------------------------------------------------------------
const COMMUNITY_GUIDELINES: LegalDoc = {
  id: "community_guidelines",
  title: "Community Guidelines",
  version: 1,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "How Customers and Cleaners are expected to treat each other.",
  body: `# Community Guidelines

**DRAFT — pending legal review.** These guidelines sit alongside the Acceptable Use Policy and apply to **everyone**.

## 1. Respect
Treat every person on the Platform with courtesy and respect. No discrimination, harassment, or abusive language — in messages, in person, or in reviews.

## 2. Honesty
- Customers: describe the property and the job accurately, and provide safe access.
- Cleaners: describe your services, rates, and availability honestly. Only claim skills and extras you actually offer.

## 3. Reliability
- Turn up on time, or communicate early if plans change.
- Honour confirmed bookings. Repeated no-shows or late cancellations harm the community and may affect your standing.

## 4. Reviews & ratings
4.1 Reviews must be **genuine, first-hand, and fair**. Do not post fake, incentivised, retaliatory, or irrelevant reviews.
4.2 Do not include personal data of others, abuse, or unlawful content in reviews.
4.3 By posting a review or other content, you grant us a **worldwide, non-exclusive, royalty-free licence** to host, display, and moderate that content on the Platform (see Platform Disclosures — Content).

## 5. Property & belongings
- Customers: secure valuables and remove hazards before the clean.
- Cleaners: treat the property and belongings with care.

## 6. Zero tolerance
Threats, violence, theft, sexual harassment, and discrimination are never acceptable and will lead to removal and, where appropriate, referral to the authorities.

Contact: ${c.email}
`,
};

// ---------------------------------------------------------------------------
// 8. PLATFORM DISCLOSURES  (DSA / ODR / P2B ranking / verification / IP)
// ---------------------------------------------------------------------------
const PLATFORM_DISCLOSURES: LegalDoc = {
  id: "platform_disclosures",
  title: "Platform Disclosures",
  version: 1,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "Ranking, dispute resolution, verification limits and content — as EU law requires.",
  body: `# Platform Disclosures

**DRAFT — pending legal review.** Groups the transparency disclosures required of an EU online platform. Forms part of the Terms & Conditions.

## 1. How cleaners are ranked (EU P2B Regulation)
1.1 When you browse cleaners, you can **sort** by: top rated, cheapest, most reviewed, or your favourites. The order shown reflects the sort you choose.
1.2 The **main parameters** that affect the default ordering and matching are:
- your selected **date, time and duration** (only available cleaners are shown);
- the **city / service area** of the property (only cleaners who cover it are shown);
- the cleaner's **average rating** and **number of reviews**;
- the cleaner's **rate**;
- your **favourites**.
1.3 We do **not** accept payment from cleaners for higher ranking. Any future paid-placement or promoted feature would be **clearly labelled** as such.
1.4 Trust badges (e.g. "Verified", "Top rated") are derived from **objective, published criteria** (identity verification status, rating thresholds, and job counts).

## 2. Dispute resolution & Online Dispute Resolution (ODR)
2.1 If you have a complaint, contact us first at ${c.email}; we aim to resolve it fairly.
2.2 **EU consumers** may also use the European Commission's **Online Dispute Resolution platform**: https://ec.europa.eu/consumers/odr
2.3 This does not affect your right to bring proceedings before the competent courts, or your mandatory statutory consumer rights.

## 3. Illegal content — notice and action (EU Digital Services Act)
3.1 You can **report** illegal content, listings, reviews, or conduct via the in-app tools or ${c.email}.
3.2 We will review valid notices, act where appropriate (e.g. remove content or restrict an account), and inform the reporter and, where required, the affected user of our decision and the reasons for it.
3.3 Our **single point of contact** for users and authorities on these matters is ${c.email}.
3.4 Decisions to remove content or restrict accounts can be **appealed** by replying to our decision notice; we will review appeals in good faith.

## 4. What verification does and does not mean
4.1 A "Verified" badge means we carried out a **basic identity check** on the documents provided at the time.
4.2 It is **not** a guarantee of a cleaner's skill, honesty, safety, insurance, right to work, or the quality of any clean. It is **not** a background/criminal-record check unless expressly stated. You remain responsible for your own judgement and for securing your property.

## 5. Your content and our licence
5.1 You keep ownership of content you submit (reviews, photos, messages).
5.2 You grant us a **worldwide, non-exclusive, royalty-free, sublicensable licence** to host, store, reproduce, display, and moderate that content **solely to operate, promote, and improve the Platform** and to handle disputes. This licence ends when the content is deleted, except where we must retain it for legal, safety, or dispute-record reasons.
5.3 Dispute photos are **time-stamped** and may be shared with the other party to that dispute and used to reach a decision (see the Privacy Policy).

Contact: ${c.email}
`,
};

// ---------------------------------------------------------------------------
// 9. INSURANCE & LIABILITY DISCLOSURE  (both sides)
// ---------------------------------------------------------------------------
const INSURANCE: LegalDoc = {
  id: "insurance",
  title: "Insurance & Liability Disclosure",
  version: 1,
  effectiveDate: "2026-01-01",
  audience: "customer",
  summary: "Who is (and isn't) insured, and how damage or injury claims work.",
  body: `# Insurance & Liability Disclosure

**DRAFT — pending legal review. Decide the Platform's actual insurance position with your insurer and lawyer before publishing — the bracketed choices below MUST be resolved.**

## 1. The Platform's position
1.1 We are an **intermediary marketplace**, not a cleaning company. We do **not** ourselves provide the cleaning service.
1.2 **[CHOOSE ONE — do not ship both:]**
- **(A) No platform-provided cover:** We do **not** provide insurance covering the cleaning work, the Cleaner, or the Customer. Each party is responsible for arranging their own insurance.
- **(B) Limited platform-arranged cover:** We provide **[describe the cover, e.g. limited public-liability cover of up to €[AMOUNT] per incident, subject to a €[EXCESS] excess and the policy terms at [LINK]]**. This cover is **secondary** to any insurance the Cleaner holds and is subject to the insurer's terms, exclusions, and claims process.

## 2. Cleaners
2.1 Cleaners are **independent, self-employed providers** (see the Cleaner Agreement).
2.2 Cleaners are **responsible for holding their own insurance** appropriate to their work (e.g. public liability), and are liable for loss, damage, theft, or injury they cause.

## 3. Customers
3.1 Customers are responsible for **securing valuables** and providing **safe access** and a safe working environment.
3.2 Household contents and property should be covered by the Customer's own home/contents insurance where applicable.

## 4. Damage, loss or injury claims
4.1 Claims about **damage, loss, theft, or injury** arising from a cleaning are primarily **between the Customer and the Cleaner**, who are the parties to the cleaning contract.
4.2 We may operate a good-faith facilitation process (see the Refund & Cancellation Policy) and, where option (B) applies, will point you to the relevant claims process. Facilitating a claim does **not** make us the provider of the service or liable for it.
4.3 Nothing here excludes liability that cannot lawfully be excluded (including for death or personal injury caused by negligence, or fraud).

Contact: ${c.email}
`,
};

// ---------------------------------------------------------------------------
export const LEGAL_DOCS: LegalDoc[] = [
  TERMS, PRIVACY, COOKIES, REFUND, CLEANER_AGREEMENT,
  ACCEPTABLE_USE, COMMUNITY_GUIDELINES, PLATFORM_DISCLOSURES, INSURANCE,
];

// Docs a Customer must accept at signup.
export const CUSTOMER_DOC_IDS = [
  "terms", "privacy", "cookies", "refund",
  "acceptable_use", "community_guidelines", "platform_disclosures", "insurance",
] as const;
// Docs a Cleaner must ADDITIONALLY accept when activating the agent side.
export const CLEANER_DOC_IDS = ["cleaner_agreement"] as const;

// Version of the "customer supplies products/tools" terms shown as a pre-payment
// warning. Bump this if the supply rule changes — a user who ticked "don't show
// again" will then see the updated warning once more.
export const SUPPLY_TERMS_VERSION = 1;

export function getLegalDoc(id: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.id === id);
}

// Compact map of id -> current version, used to detect when a user's stored
// acceptance is out of date and re-consent is needed.
export function currentVersions(ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const d = getLegalDoc(id);
    if (d) out[id] = d.version;
  }
  return out;
}
