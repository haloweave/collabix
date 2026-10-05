// Ticket credential generators. Server-only in practice (node:crypto); kept out
// of ticket.ts so client components can import the state machine.

import { randomBytes, randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_PREFIX } from "./ticket";

/** 128-bit opaque token, 22 base64url chars — what the QR link carries. */
export const newTicketToken = () => randomBytes(16).toString("base64url");

/** Short staff-typeable backup code, e.g. CBX-7K4Q. A lookup key behind staff
 * auth, never a bearer credential on its own. */
export function newTicketCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return CODE_PREFIX + s;
}
