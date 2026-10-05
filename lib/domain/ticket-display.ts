// Ticket copy shared by the guest page, the staff scan card and the email.
// Client-safe. PAYMENT_NOTE flips to "Paid" once Cashfree checkout lands.

import { istDate, istTime, rupees } from "../admin/format";
import { isMultiDay } from "./ticket";

export const PAYMENT_NOTE = "Pay at desk";
export const VENUE_ADDRESS =
  "Collabix Work Lounge, 261, Ashwini Arcade, 3rd Floor, 100 Feet Road, HRBR Layout, Bengaluru, Karnataka 560043";
export const VENUE_MAPS_URL = "https://maps.app.goo.gl/arjxnvUYfqe5oUKX7";

export function ticketWhen(v: { startAt: Date; endAt: Date }): string {
  if (isMultiDay(v.startAt, v.endAt)) {
    return `${istDate(v.startAt)} – ${istDate(new Date(v.endAt.getTime() - 1))}`;
  }
  return `${istDate(v.startAt)} · ${istTime(v.startAt)}–${istTime(v.endAt)} IST`;
}

export function ticketAmount(v: { totalMinor: number | null }): string {
  return v.totalMinor == null
    ? "Included in membership"
    : `${rupees(v.totalMinor)} · ${PAYMENT_NOTE}`;
}

export function ticketSeats(v: { seats: number; resourceCodes: string[] }): string {
  return `${v.seats} seat${v.seats === 1 ? "" : "s"} · ${v.resourceCodes.join(", ")}`;
}
