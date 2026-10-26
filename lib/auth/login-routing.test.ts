import { describe, expect, test } from "vitest";
import { classifyIdentifier, dashboardFor } from "./login-routing";

describe("dashboardFor", () => {
  test("sends each role to its own dashboard", () => {
    expect(dashboardFor("owner")).toBe("/admin");
    expect(dashboardFor("manager")).toBe("/admin");
    expect(dashboardFor("staff")).toBe("/admin");
    expect(dashboardFor("reception")).toBe("/staff");
    expect(dashboardFor("member")).toBe("/account");
  });
  test("unknown or missing roles are treated as members", () => {
    expect(dashboardFor(undefined)).toBe("/account");
    expect(dashboardFor("weird")).toBe("/account");
  });
});

describe("classifyIdentifier", () => {
  test("recognises an email and lowercases it", () => {
    expect(classifyIdentifier("  Owner@Collabix.co.in ")).toEqual({ kind: "email", value: "owner@collabix.co.in" });
  });
  test("turns a 10-digit Indian mobile into E.164", () => {
    expect(classifyIdentifier("98765 43210")).toEqual({ kind: "phone", value: "+919876543210" });
    expect(classifyIdentifier("0 98765-43210")).toEqual({ kind: "phone", value: "+919876543210" });
    expect(classifyIdentifier("91 98765 43210")).toEqual({ kind: "phone", value: "+919876543210" });
  });
  test("keeps an international number with its + prefix", () => {
    expect(classifyIdentifier("+44 7700 900123")).toEqual({ kind: "phone", value: "+447700900123" });
  });
  test("rejects things that are neither", () => {
    expect(classifyIdentifier("")).toBeNull();
    expect(classifyIdentifier("hello")).toBeNull();
    expect(classifyIdentifier("12345")).toBeNull();
    expect(classifyIdentifier("not an@email")).toBeNull();
  });
});
