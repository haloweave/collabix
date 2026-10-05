// One staff scan: resolve the ticket, decide validity from live state, and —
// if valid now (or too early with an explicit staff override) — check in.
// Auth, audit and cache revalidation live in the server action wrapper.

import { getSettings } from "../settings";
import { stampCheckIn } from "./checkin";
import type { Db } from "./reservations";
import { normalizeTicketInput, ticketState, type TicketState } from "./ticket";
import { getTicketView, toTicketBooking, type TicketView } from "./ticket-view";

export type ScanMethod = "scan" | "code" | "override";

export type ScanOutcome =
  | { kind: "invalid" }
  | {
      kind: "ticket";
      view: TicketView;
      state: TicketState;
      justCheckedIn: boolean;
      method: ScanMethod | null;
    };

export async function scanTicketCore(
  db: Db,
  raw: string,
  opts: { override?: boolean; now?: Date } = {},
): Promise<ScanOutcome> {
  const key = normalizeTicketInput(raw);
  if (!key) return { kind: "invalid" };
  const view = await getTicketView(db, key);
  if (!view) return { kind: "invalid" };

  const now = opts.now ?? new Date();
  const hours = await getSettings(db);
  const state = ticketState(toTicketBooking(view, hours), now);

  const eligible =
    !state.checkedInAt &&
    (state.phase === "valid_now" || (state.phase === "too_early" && !!opts.override));
  if (!eligible) return { kind: "ticket", view, state, justCheckedIn: false, method: null };

  const method: ScanMethod =
    state.phase === "too_early" ? "override" : "token" in key ? "scan" : "code";
  const justCheckedIn = await stampCheckIn(db, view.bookingId, now);
  const fresh = (await getTicketView(db, { bookingId: view.bookingId })) ?? view;
  return {
    kind: "ticket",
    view: fresh,
    state: ticketState(toTicketBooking(fresh, hours), now),
    justCheckedIn,
    method: justCheckedIn ? method : null,
  };
}
