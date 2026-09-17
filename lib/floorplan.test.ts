import { describe, expect, test } from "vitest";
import {
  FLOOR,
  deskBanks,
  rooms,
  seats,
  renderSeats,
} from "./floorplan";

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

  test("seat kind is always a bookable resource kind", () => {
    for (const s of seats()) {
      expect(["desk", "room"]).toContain(s.kind);
    }
  });

  test("rooms are the only room-kind seats", () => {
    const roomSeats = seats().filter((s) => s.kind === "room");
    expect(roomSeats.length).toBe(rooms.length);
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
      null,
    );
    const seat = out.find((s) => s.code === code)!;
    expect(seat.state).toBe("available");
    expect(seat.resourceId).toBe("r1");
  });

  test("a seat in an unavailable slot is marked unavailable", () => {
    const code = anyDeskCode();
    const out = renderSeats(
      [{ resourceId: "r1", code, available: false }],
      null,
    );
    expect(out.find((s) => s.code === code)!.state).toBe("unavailable");
  });

  test("the selected resource renders as selected", () => {
    const code = anyDeskCode();
    const out = renderSeats(
      [{ resourceId: "r1", code, available: true }],
      "r1",
    );
    expect(out.find((s) => s.code === code)!.state).toBe("selected");
  });

  test("seats not in the slot list render as context", () => {
    const roomCode = anyRoomCode();
    // Only a desk slot is live, so the room falls back to context.
    const out = renderSeats(
      [{ resourceId: "r1", code: anyDeskCode(), available: true }],
      null,
    );
    const room = out.find((s) => s.code === roomCode)!;
    expect(room.state).toBe("context");
    expect(room.resourceId).toBeNull();
  });

  test("unknown codes in the slot list do not throw or appear", () => {
    const out = renderSeats(
      [{ resourceId: "x", code: "NOPE-99", available: true }],
      null,
    );
    expect(out.some((s) => s.code === "NOPE-99")).toBe(false);
    expect(out.length).toBe(seats().length);
  });
});
