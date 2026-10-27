// The supplier block printed on every invoice, as registered with GST
// (Form GST REG-06, issued 13 Jul 2026). Keep in step with the certificate,
// not the marketing address.

export const SELLER = {
  legalName: "COLLABIX WORK LOUNGE",
  tradeName: "Collabix Work Lounge",
  gstin: "29AAWFC6805H1ZX",
  addressLines: [
    "3rd Floor, No. 10, Aswini Arcade, 100 Feet Road",
    "Banaswadi, Bengaluru 560043",
    "Karnataka, India",
  ],
  state: "Karnataka",
  stateCode: "29",
  email: "connect@collabix.co.in",
  phone: "+91 96327 71444",
  website: "www.collabix.co.in",
} as const;

/** Business-centre / co-working services ("rental of non-residential property"). */
export const SAC_COWORKING = "997212";

/** Coworking is supplied at the premises (IGST Act s.12(3)), so the place of
 * supply is always Karnataka and the tax splits into CGST + SGST. */
export const PLACE_OF_SUPPLY = `${SELLER.state} (${SELLER.stateCode})`;
