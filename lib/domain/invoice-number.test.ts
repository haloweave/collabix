import { describe, expect, test } from "vitest";
import { financialYear, formatInvoiceNo } from "./invoice-number";

const ist = (s: string) => new Date(`${s}+05:30`);

describe("financialYear", () => {
  test("April opens a new year", () => {
    expect(financialYear(ist("2026-04-01T00:00:00"))).toBe("26-27");
    expect(financialYear(ist("2026-10-27T12:00:00"))).toBe("26-27");
  });

  test("January–March belong to the year that began the previous April", () => {
    expect(financialYear(ist("2027-03-31T23:59:59"))).toBe("26-27");
    expect(financialYear(ist("2027-01-01T00:00:00"))).toBe("26-27");
  });

  test("the boundary is midnight IST, not UTC", () => {
    // 31 Mar 20:00 UTC is already 1 Apr 01:30 in Bengaluru.
    expect(financialYear(new Date("2027-03-31T20:00:00Z"))).toBe("27-28");
  });

  test("the century rolls over cleanly", () => {
    expect(financialYear(ist("2099-06-01T00:00:00"))).toBe("99-00");
  });
});

describe("formatInvoiceNo", () => {
  test("pads the serial and stays within GST's 16 characters", () => {
    expect(formatInvoiceNo("26-27", 1)).toBe("CBX/26-27/0001");
    expect(formatInvoiceNo("26-27", 123456)).toBe("CBX/26-27/123456");
    expect(formatInvoiceNo("26-27", 123456).length).toBeLessThanOrEqual(16);
  });
});
