// Ticket copy shared by the guest page, the staff scan card and the email.
// Client-safe. Public bookings are paid online (Cashfree) and read "Paid";
// staff-made bookings are still settled at the desk.

import { istDate, istTime, rupees } from "../admin/format";
import { isMultiDay } from "./ticket";
import { bookableProduct, findTermPlan } from "../tariff";

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

export function ticketSeats(v: {
  seats: number;
  resourceCodes: string[];
  plan?: string | null;
  planKey?: string | null;
}): string {
  const product = v.planKey ? bookableProduct(v.planKey) : undefined;
  // A day pass is any free shared desk, so no desk number is printed.
  if (product?.kind === "pass") return `${v.seats} ${v.seats === 1 ? "person" : "people"} · Any shared desk`;
  // An hourly cabin says which cabin ("Cabin (hourly) · Cabin 5"); the
  // boardroom is just its name.
  if (product?.kind === "room") {
    const cabins = v.resourceCodes.filter((c) => c.startsWith("C-")).map((c) => `Cabin ${Number(c.slice(2))}`);
    return cabins.length ? `${product.name} · ${cabins.join(", ")}` : product.name;
  }
  // A monthly or annual pass: the plan and the desk or cabin it holds. A
  // booking that mixes plans names them all ("Cabin · Base + Dedicated Desk").
  const term = v.planKey ? findTermPlan(v.planKey) : undefined;
  if (term) return `${v.plan?.includes(" + ") ? v.plan : term.name} · ${v.resourceCodes.join(", ")}`;
  return `${v.seats} seat${v.seats === 1 ? "" : "s"} · ${v.resourceCodes.join(", ")}`;
}
