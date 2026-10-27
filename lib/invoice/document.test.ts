import { describe, expect, test } from "vitest";
import { bookingInvoice, splitGst, type BookingInvoiceSource } from "./document";

const source = (over: Partial<BookingInvoiceSource> = {}): BookingInvoiceSource => ({
  invoiceNo: "CBX/26-27/0001",
  invoicedAt: new Date("2026-10-27T06:00:00Z"),
  status: "active",
  buyer: { name: "Asha Rao", email: "asha@example.com" },
  plan: "Half Day Pass",
  seats: 2,
  ticketCode: "CBX-AB12",
  when: "1 Dec 2026 · 09:00–13:00 IST",
  quote: {
    lines: [{ label: "Half Day Pass", qty: 2, unitMinor: 19900, amountMinor: 39800 }],
    subtotalMinor: 39800,
    taxMinor: 7164,
    totalMinor: 46964,
  },
  payment: { method: "upi", reference: "cf_123", paidAt: new Date("2026-10-27T06:00:00Z") },
  ...over,
});

describe("splitGst", () => {
  test("halves the tax, giving an odd paisa to SGST", () => {
    expect(splitGst(7164)).toEqual({ cgstMinor: 3582, sgstMinor: 3582 });
    expect(splitGst(7165)).toEqual({ cgstMinor: 3582, sgstMinor: 3583 });
  });
});

describe("bookingInvoice", () => {
  test("carries the checkout quote line by line", () => {
    const doc = bookingInvoice(source());
    expect(doc.lines).toEqual([
      expect.objectContaining({ description: "Half Day Pass", qty: 2, unitMinor: 19900, amountMinor: 39800, sac: "997212" }),
    ]);
    expect(doc.lines[0].detail).toBe("1 Dec 2026 · 09:00–13:00 IST");
    expect(doc.subtotalMinor + doc.cgstMinor + doc.sgstMinor).toBe(doc.totalMinor);
    expect(doc.halfRatePercent).toBe(9);
    expect(doc.payment).toMatchObject({ status: "paid", method: "upi" });
    expect(doc.facts).toContainEqual(["Booking ref", "CBX-AB12"]);
    expect(doc.facts).toContainEqual(["Place of supply", "Karnataka (29)"]);
  });

  test("an unpaid booking is due at the desk", () => {
    expect(bookingInvoice(source({ payment: null })).payment).toEqual({
      status: "due",
      note: "Settle at the Collabix front desk on your visit (ignore if already paid)",
    });
  });

  test("a staff all-in total is read as GST-inclusive", () => {
    const doc = bookingInvoice(
      source({ quote: { extended: true, totalMinor: 500000, subtotalMinor: 500000, taxMinor: 0 } }),
    );
    expect(doc.totalMinor).toBe(500000);
    expect(doc.subtotalMinor).toBe(423729);
    expect(doc.cgstMinor + doc.sgstMinor).toBe(76271);
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]).toMatchObject({ description: "Half Day Pass", amountMinor: 423729 });
  });

  test("falls back to one line when the snapshot lines don't add up", () => {
    const doc = bookingInvoice(
      source({ quote: { subtotalMinor: 1000, taxMinor: 180, totalMinor: 1180, lines: [{ label: "x", qty: 1, unitMinor: 5, amountMinor: 5 }] } }),
    );
    expect(doc.lines).toEqual([expect.objectContaining({ description: "Half Day Pass", amountMinor: 1000 })]);
  });

  test("flags a cancelled booking", () => {
    expect(bookingInvoice(source({ status: "cancelled" })).cancelled).toBe(true);
  });
});
