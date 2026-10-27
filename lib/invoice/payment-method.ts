// How a payment method reads on invoices and in the admin. Client-safe.

const METHOD: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  credit_card: "Credit card",
  debit_card: "Debit card",
  netbanking: "Net banking",
  net_banking: "Net banking",
  app: "Wallet",
  wallet: "Wallet",
};

export const paymentMethodLabel = (m: string | null | undefined) =>
  m ? (METHOD[m.toLowerCase()] ?? m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())) : null;
