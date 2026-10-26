// @cashfreepayments/cashfree-js ships no types. Only the surface the booking
// page uses (Cashfree docs: "Open Cashfree Checkout", popup variant).
declare module "@cashfreepayments/cashfree-js" {
  export type CashfreeCheckoutResult = {
    error?: { message?: string } | unknown;
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string };
  };
  export type CashfreeCheckoutOptions = {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_top" | "_modal" | HTMLElement;
  };
  export type CashfreeInstance = {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>;
  };
  export function load(options: { mode: "sandbox" | "production" }): Promise<CashfreeInstance | null>;
}
