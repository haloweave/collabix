// Prepaid wallet. Every movement is a row in wallet_entry and the balance is
// their sum, so history is never rewritten. Writes that depend on the balance
// take a per-customer advisory lock first, so two spends can't both see the
// same rupees.

import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { confirmBooking, type Db, type Tx } from "./reservations";
import type { Quote } from "./booking";

export const WALLET_KINDS = ["topup", "credit", "adjust", "spend", "refund"] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];
export const TOPUP_METHODS = ["cash", "upi", "card", "bank_transfer"] as const;
/** One top-up or credit is capped at ₹2,00,000 to catch a mistyped amount. */
export const MAX_WALLET_ENTRY_MINOR = 2_00_000_00;

/** The order id a wallet-paid booking's payment row carries. */
export const walletOrderId = (bookingId: string) => `wallet_${bookingId}`;

async function lockWallet(tx: Tx, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`);
}

export async function walletBalance(db: Db | Tx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`COALESCE(SUM(${schema.walletEntry.amountMinor}), 0)` })
    .from(schema.walletEntry)
    .where(eq(schema.walletEntry.userId, userId));
  return Number(row?.n ?? 0);
}

export type WalletEntryRow = typeof schema.walletEntry.$inferSelect;

export async function walletHistory(db: Db, userId: string, limit = 50): Promise<WalletEntryRow[]> {
  return db
    .select()
    .from(schema.walletEntry)
    .where(eq(schema.walletEntry.userId, userId))
    .orderBy(desc(schema.walletEntry.createdAt))
    .limit(limit);
}

export type AddFundsResult =
  | { ok: true; balanceMinor: number }
  | { ok: false; error: "bad_amount" | "bad_method" | "would_go_negative" };

/**
 * Staff add money (topup, paid at the desk), give credit, or correct the
 * balance (adjust, may be negative but never below zero).
 */
export async function addWalletEntry(
  db: Db,
  input: {
    userId: string;
    kind: "topup" | "credit" | "adjust";
    amountMinor: number;
    method?: string;
    note?: string;
    by: string;
  },
): Promise<AddFundsResult> {
  const amount = Math.trunc(input.amountMinor);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_WALLET_ENTRY_MINOR)
    return { ok: false, error: "bad_amount" };
  if (input.kind !== "adjust" && amount < 0) return { ok: false, error: "bad_amount" };
  if (input.kind === "topup" && !(TOPUP_METHODS as readonly string[]).includes(input.method ?? ""))
    return { ok: false, error: "bad_method" };

  return db.transaction(async (tx) => {
    await lockWallet(tx, input.userId);
    const balance = await walletBalance(tx, input.userId);
    if (balance + amount < 0) return { ok: false, error: "would_go_negative" };
    await tx.insert(schema.walletEntry).values({
      userId: input.userId,
      kind: input.kind,
      amountMinor: amount,
      method: input.kind === "topup" ? input.method : null,
      note: input.note?.trim().slice(0, 200) || null,
      createdBy: input.by,
    });
    return { ok: true, balanceMinor: balance + amount };
  });
}

export type WalletPayResult =
  | { ok: true; ticketToken: string; amountMinor: number; balanceMinor: number }
  | {
      ok: false;
      error: "not_found" | "not_payable" | "already_paid" | "insufficient_funds" | "hold_expired" | "no_amount";
    };

/**
 * Pay a booking from the customer's wallet and confirm it, all in one
 * transaction: if the seat can't be confirmed, nothing is charged.
 * `allowConfirmed` lets the front desk charge a booking that staff already
 * confirmed (pay-at-desk); the public checkout only pays live holds.
 */
export async function payFromWallet(
  db: Db,
  input: { bookingId: string; userId: string; by: string; allowConfirmed?: boolean },
): Promise<WalletPayResult> {
  return db.transaction(async (tx) => {
    await lockWallet(tx, input.userId);
    const [b] = await tx
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.id, input.bookingId))
      .for("update");
    if (!b || b.status !== "active") return { ok: false, error: "not_found" };

    const rows = await tx
      .select()
      .from(schema.reservation)
      .where(eq(schema.reservation.bookingId, input.bookingId));
    if (rows.length === 0) return { ok: false, error: "not_found" };
    const confirmed = rows.some((r) => r.status === "confirmed");
    if (confirmed && !input.allowConfirmed) return { ok: false, error: "not_payable" };
    if (!confirmed && !rows.some((r) => r.status === "held")) return { ok: false, error: "hold_expired" };

    const [paid] = await tx
      .select({ id: schema.payment.id })
      .from(schema.payment)
      .where(and(eq(schema.payment.bookingId, input.bookingId), eq(schema.payment.status, "paid")))
      .limit(1);
    if (paid) return { ok: false, error: "already_paid" };

    const amountMinor = Number((rows[0].quoteSnapshot as Quote | null)?.totalMinor ?? 0);
    if (amountMinor < 100) return { ok: false, error: "no_amount" };
    const balance = await walletBalance(tx, input.userId);
    if (balance < amountMinor) return { ok: false, error: "insufficient_funds" };

    const c = await confirmBooking(tx, { bookingId: input.bookingId, memberId: input.userId });
    if (!c.ok) return { ok: false, error: c.error === "hold_expired" ? "hold_expired" : "not_payable" };
    // A staff-confirmed booking keeps whoever it was linked to; a checkout
    // links it to the payer (confirmBooking only links on first confirmation).
    if (!b.memberId) {
      await tx.update(schema.booking).set({ memberId: input.userId }).where(eq(schema.booking.id, input.bookingId));
    }

    const now = new Date();
    await tx.insert(schema.payment).values({
      bookingId: input.bookingId,
      memberId: input.userId,
      provider: "wallet",
      orderId: walletOrderId(input.bookingId),
      amountMinor,
      status: "paid",
      paymentMethod: "wallet",
      paidAt: now,
      raw: { by: input.by },
    });
    await tx.insert(schema.walletEntry).values({
      userId: input.userId,
      kind: "spend",
      amountMinor: -amountMinor,
      bookingId: input.bookingId,
      createdBy: input.by,
    });
    return { ok: true, ticketToken: c.ticketToken, amountMinor, balanceMinor: balance - amountMinor };
  });
}

/**
 * Put a cancelled wallet-paid booking's money back in the wallet. Called
 * inside the cancelling transaction; idempotent via the (booking, kind) index.
 */
export async function refundToWallet(
  tx: Tx,
  input: { bookingId: string; userId: string; amountMinor: number; by: string },
): Promise<void> {
  await lockWallet(tx, input.userId);
  await tx
    .insert(schema.walletEntry)
    .values({
      userId: input.userId,
      kind: "refund",
      amountMinor: input.amountMinor,
      bookingId: input.bookingId,
      createdBy: input.by,
    })
    .onConflictDoNothing();
}
