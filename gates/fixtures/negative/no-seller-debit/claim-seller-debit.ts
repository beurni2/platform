// NEGATIVE FIXTURE: a seller charged when a claim is decided against them.
// A seller-fault claim refunds the buyer and costs the seller access, never
// money. This gate MUST fail on this file. Never import this.
export interface ClaimDecisionWithSellerCharge {
  claimId: string;
  sellerDebitFcfa: number;
}
export function debitSellerOnFault(claimId: string, amountFcfa: number): void {
  void claimId;
  void amountFcfa;
}
