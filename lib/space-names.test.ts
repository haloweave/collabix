import { describe, expect, test } from "vitest";
import { spaceLabel, spaceName, spaceType, spacesText, staffSpace } from "./space-names";

describe("space names", () => {
  test("every room has the client's name and what kind of space it is", () => {
    expect([spaceName("C-01"), spaceType("C-01")]).toEqual(["Origin", "Executive Cabin"]);
    expect([spaceName("C-02"), spaceType("C-02")]).toEqual(["Axis", "Executive Cabin"]);
    expect([spaceName("C-03"), spaceType("C-03")]).toEqual(["Summit", "Executive Cabin"]);
    expect([spaceName("C-04"), spaceType("C-04")]).toEqual(["Vertex", "4-Seater Meeting Room"]);
    expect([spaceName("C-05"), spaceType("C-05")]).toEqual(["Nexus", "4-Seater Meeting Room"]);
    expect([spaceName("M-01"), spaceType("M-01")]).toEqual(["The Boardroom", "8-Seater Conference Room"]);
  });

  test("a label says both, so a first-timer knows what they booked", () => {
    expect(spaceLabel("C-01")).toBe("Origin (Executive Cabin)");
    expect(spaceLabel("C-05")).toBe("Nexus (4-Seater Meeting Room)");
    expect(spaceLabel("M-01")).toBe("The Boardroom (8-Seater Conference Room)");
  });

  test("desks keep their number", () => {
    expect(spaceName("D-07")).toBe("Desk 07");
    expect(spaceType("D-07")).toBe("Shared Desk");
    expect(spaceLabel("D-07")).toBe("Desk 07");
  });

  test("staff see the name with the code they know", () => {
    expect(staffSpace("C-01")).toBe("Origin (C-01)");
    expect(staffSpace("D-07")).toBe("D-07");
  });

  test("an unknown code falls back to itself", () => {
    expect(spaceLabel("X-99")).toBe("X-99");
  });

  test("a list of spaces reads naturally, desks grouped", () => {
    expect(spacesText(["D-12", "D-14", "C-02"])).toBe("Desks 12, 14, Axis (Executive Cabin)");
    expect(spacesText(["C-04"])).toBe("Vertex (4-Seater Meeting Room)");
    expect(spacesText(["D-03"])).toBe("Desk 03");
    expect(spacesText([])).toBe("");
  });
});
