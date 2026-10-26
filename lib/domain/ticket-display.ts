// Ticket copy shared by the guest page, the staff scan card and the email.
// Client-safe. Public bookings are paid online (Cashfree) and read "Paid";
// staff-made bookings are still settled at the desk.

import { istDate, istTime, rupees } from "../admin/format";
import { isMultiDay } from "./ticket";

export const PAY_AT_DESK = "Pay at desk";
export const PAID = "Paid";
export const VENUE_ADDRESS =
  "Collabix Work Lounge, 261, Ashwini Arcade, 3rd Floor, 100 Feet Road, HRBR Layout, Bengaluru, Karnataka 560043";
export const VENUE_MAPS_URL = "https://maps.app.goo.gl/arjxnvUYfqe5oUKX7";

export function ticketWhen(v: { startAt: Date; endAt: Date }): string {
  if (isMultiDay(v.startAt, v.endAt)) {
    return `${istDate(v.startAt)} – ${istDate(new Date(v.endAt.getTime() - 1))}`;
  }
  return `${istDate(v.startAt)} · ${istTime(v.startAt)}–${istTime(v.endAt)} IST`;
}

export function ticketAmount(v: { totalMinor: number | null; paid?: boolean }): string {
  return v.totalMinor == null
    ? "Included in membership"
    : `${rupees(v.totalMinor)} · ${v.paid ? PAID : PAY_AT_DESK}`;
}

export function ticketSeats(v: { seats: number; resourceCodes: string[] }): string {
  return `${v.seats} seat${v.seats === 1 ? "" : "s"} · ${v.resourceCodes.join(", ")}`;
}
