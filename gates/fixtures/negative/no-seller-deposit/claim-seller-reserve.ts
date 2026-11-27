// NEGATIVE FIXTURE: a seller's reserve or deposit on a record shaped like a
// fund claim. Law 4: zero seller deposit, no reserve field, ever. This gate
// MUST fail on this file. Never import this.
export interface ClaimRecordWithSellerReserve {
  claimId: string;
  sellerReserveFcfa: number;
  reserveAmountFcfa: number;
  sellerDepositFcfa: number;
}
