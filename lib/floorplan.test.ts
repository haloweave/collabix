import { describe, expect, test } from "vitest";
import {
  FLOOR,
  contextShapes,
  deskBanks,
  rooms,
  seats,
  renderSeats,
  autoAssignDesks,
  registryKeyFor,
} from "./floorplan";

const bankOf = new Map(seats().map((s) => [s.code, s.bankId]));

describe("floor geometry", () => {
  test("every seat code is unique", () => {
    const codes = seats().map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("every seat lies within the floor bounds", () => {
    for (const s of seats()) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(FLOOR.width);
      expect(s.y + s.h).toBeLessThanOrEqual(FLOOR.height);
    }
  });

  test("no two seats or rooms overlap", () => {
    const all = seats();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.code} overlaps ${b.code}`).toBe(true);
      }
    }
  });

  test("no context shape covers a bookable seat", () => {
    for (const c of contextShapes) {
      for (const s of seats()) {
        const apart =
          c.x + c.w <= s.x || s.x + s.w <= c.x || c.y + c.h <= s.y || s.y + s.h <= c.y;
        expect(apart, `${c.label} overlaps ${s.code}`).toBe(true);
      }
    }
  });

  test("facing desks in a bank keep their chairs on the outside", () => {
    const bySide = (bank: string) =>
      seats().filter((s) => s.bankId === bank).map((s) => s.chair);
    expect(new Set(bySide("center-top"))).toEqual(new Set(["left", "right"]));
    expect(new Set(bySide("left-mid"))).toEqual(new Set(["top", "bottom"]));
  });

  test("seat kind is always a bookable resource kind", () => {
    for (const s of seats()) {
      expect(["desk", "room"]).toContain(s.kind);
    }
  });

  test("rooms are the only room-kind seats", () => {
    const roomSeats = seats().filter((s) => s.kind === "room");
    expect(roomSeats.length).toBe(rooms.length);
  });

  test("inventory matches the tariff: 28 desks, 4 cabins, 2 meeting rooms", () => {
    expect(seats().filter((s) => s.kind === "desk").length).toBe(28);
    expect(rooms.map((r) => r.code)).toEqual(["M-01", "M-02", "C-01", "C-02", "C-03", "C-04"]);
    expect(rooms.find((r) => r.code === "M-01")).toMatchObject({ label: "The Boardroom", capacity: 8 });
    expect(rooms.find((r) => r.code === "M-02")).toMatchObject({ label: "Meeting Room (4-seater)", capacity: 4 });
  });

  test("registryKeyFor names the registry row a held resource books under", () => {
    expect(registryKeyFor({ code: "D-07", kind: "desk" })).toBe("desk-membership");
    expect(registryKeyFor({ code: "C-03", kind: "room" })).toBe("cabin-membership");
    expect(registryKeyFor({ code: "M-01", kind: "room" })).toBe("boardroom");
    expect(registryKeyFor({ code: "M-02", kind: "room" })).toBe("meeting-4");
  });

  test("desk count matches the declared banks", () => {
    const declared = deskBanks.reduce((n, b) => n + b.rows * b.cols, 0);
    const deskSeats = seats().filter((s) => s.kind === "desk");
    expect(deskSeats.length).toBe(declared);
  });
});

describe("renderSeats — availability join", () => {
  const anyDeskCode = () =>
    seats().find((s) => s.kind === "desk")!.code;
  const anyRoomCode = () =>
    seats().find((s) => s.kind === "room")!.code;

  test("a seat in an available slot is interactive and available", () => {
    const code = anyDeskCode();
    const out = renderSeats(
      [{ resourceId: "r1", code, available: true }],
      [],
    );
    const seat = out.find((s) => s.code === code)!;
    expect(seat.state).toBe("available");
    expect(seat.resourceId).toBe("r1");
  });

  test("a seat in an unavailable slot is marked unavailable", () => {
    const code = anyDeskCode();
    const out = renderSeats(
      [{ resourceId: "r1", code, available: false }],
      [],
    );
    expect(out.find((s) => s.code === code)!.state).toBe("unavailable");
  });

  test("the selected resource renders as selected", () => {
    const code = anyDeskCode();
    const out = renderSeats(
      [{ resourceId: "r1", code, available: true }],
      ["r1"],
    );
    expect(out.find((s) => s.code === code)!.state).toBe("selected");
  });

  test("seats not in the slot list render as context", () => {
    const roomCode = anyRoomCode();
    // Only a desk slot is live, so the room falls back to context.
    const out = renderSeats(
      [{ resourceId: "r1", code: anyDeskCode(), available: true }],
      [],
    );
    const room = out.find((s) => s.code === roomCode)!;
    expect(room.state).toBe("context");
    expect(room.resourceId).toBeNull();
  });

  test("unknown codes in the slot list do not throw or appear", () => {
    const out = renderSeats(
      [{ resourceId: "x", code: "NOPE-99", available: true }],
      [],
    );
    expect(out.some((s) => s.code === "NOPE-99")).toBe(false);
    expect(out.length).toBe(seats().length);
  });
});

describe("autoAssignDesks — team-clustered auto-selection", () => {
  const allDeskCodes = () =>
    seats().filter((s) => s.kind === "desk").map((s) => s.code);

  test("picks n desks from a single bank when one bank can fit them", () => {
    const pick = autoAssignDesks(allDeskCodes(), 3);
    expect(pick.length).toBe(3);
    expect(new Set(pick.map((c) => bankOf.get(c))).size).toBe(1);
  });

  test("spreads across banks when no single bank can fit n", () => {
    // One available desk in each of four different banks.
    const avail = ["D-01", "D-11", "D-15", "D-21"];
    const pick = autoAssignDesks(avail, 3);
    expect(pick.length).toBe(3);
    expect(pick.every((c) => avail.includes(c))).toBe(true);
    expect(new Set(pick.map((c) => bankOf.get(c))).size).toBe(3);
  });

  test("returns as many as are available when under-supplied", () => {
    expect(autoAssignDesks(["D-01", "D-02"], 5)).toEqual(["D-01", "D-02"]);
  });

  test("never returns a code that is not in the available list", () => {
    expect(autoAssignDesks(["D-01", "NOPE"], 2)).toEqual(["D-01"]);
  });

  test("returns nothing for a non-positive count", () => {
    expect(autoAssignDesks(["D-01"], 0)).toEqual([]);
  });
});
