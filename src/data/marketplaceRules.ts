/**
 * Marketplace rules every seller must accept before phone verification.
 * Shown as a required agreement step in SellerVerificationModal.
 */
export interface MarketplaceRule {
  title: string;
  body: string;
}

export const MARKETPLACE_RULES: MarketplaceRule[] = [
  {
    title: 'Honest, accurate listings',
    body: 'Describe items truthfully — condition, defects, specifications, and pricing must match reality. Counterfeit, stolen, or misrepresented goods are prohibited.',
  },
  {
    title: 'No scams or dishonest conduct',
    body: 'Fraud, payment scams, bait-and-switch, and any dishonest dealing with other members are strictly forbidden.',
  },
  {
    title: 'Respectful communication',
    body: 'Treat buyers and sellers with respect. Harassment, threats, and abusive behaviour are not tolerated.',
  },
  {
    title: 'Verified contact details',
    body: 'Your verified phone number is shared with interested buyers. Keep it current and respond in good faith.',
  },
  {
    title: 'Enforcement & consequences',
    body: 'If you break these rules — commit a scam or behave dishonestly — and another member reports you with valid proof confirming the incident, your listings and your marketplace account will be completely disabled.',
  },
  {
    title: 'Right to appeal',
    body: 'If your account is disabled, you may oppose the decision by submitting an appeal from your dashboard. An administrator will review it.',
  },
];
