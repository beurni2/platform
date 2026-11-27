// NEGATIVE FIXTURE: a seller's money carried with its unit, on a record shaped
// like a fund claim. This gate MUST fail on this file. Never import this.
export interface ClaimRecordWithSellerMoney {
  claimId: string;
  sellerBalanceFcfa: number;
  readonly reseller_balance_xof: number;
}
