// How wallet ledger entries read to people. Client-safe.
export const WALLET_KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  credit: "Credit",
  adjust: "Correction",
  spend: "Booking",
  refund: "Refund",
};
