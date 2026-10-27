import { describe, expect, test } from "vitest";
import { isValidGstin, normalizeGstin } from "./gstin";

describe("GSTIN", () => {
  test("accepts a real registration, in any case and spacing", () => {
    expect(isValidGstin("29AAWFC6805H1ZX")).toBe(true);
    expect(isValidGstin(" 29aawfc6805h1zx ")).toBe(true);
    expect(normalizeGstin("29 aawfc 6805h1zx")).toBe("29AAWFC6805H1ZX");
  });

  test("rejects a wrong check character or shape", () => {
    expect(isValidGstin("29AAWFC6805H1ZY")).toBe(false);
    expect(isValidGstin("29AAWFC6805H1Z")).toBe(false);
    expect(isValidGstin("AAWFC6805H")).toBe(false);
  });
});
