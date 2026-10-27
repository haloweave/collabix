import { describe, expect, test } from "vitest";
import { amountInWords } from "./amount-in-words";

describe("amountInWords", () => {
  test("whole rupees", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(100)).toBe("Rupees One Only");
    expect(amountInWords(118000)).toBe("Rupees One Thousand One Hundred Eighty Only");
  });

  test("paise", () => {
    expect(amountInWords(46964)).toBe("Rupees Four Hundred Sixty Nine and Sixty Four Paise Only");
    expect(amountInWords(5)).toBe("Rupees Zero and Five Paise Only");
  });

  test("lakh and crore grouping", () => {
    expect(amountInWords(12_000_000)).toBe("Rupees One Lakh Twenty Thousand Only");
    expect(amountInWords(1_234_567_800)).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only",
    );
  });

  test("teens and round tens", () => {
    expect(amountInWords(1_900)).toBe("Rupees Nineteen Only");
    expect(amountInWords(4_000)).toBe("Rupees Forty Only");
  });
});
