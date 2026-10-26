/** Hourly, transactional products shown on the public booking page. Prices
 * come only from the DB rate plans (/api/rates), never from this list. A
 * "dedicated desk" is not a distinct product — it's a seat held long-term for a
 * member (see admin long-term holds), so it isn't listed here. */
export const spaces = [
  { key: "hotdesk", name: "Hot Desk", capacity: 1, image: "openoffice.jpg", blurb: "Any open seat, by the hour", description: "A flexible seat in the open lounge.", desk: true },
  { key: "cabin", name: "Private Cabin", capacity: 4, image: "cabin.jpg", blurb: "Private room for up to 4", description: "An enclosed, acoustic cabin for focused teamwork.", desk: false },
  { key: "meeting", name: "Meeting Room", capacity: 8, image: "meeting.jpg", blurb: "Boardroom with AV, seats 8", description: "An eight-seat boardroom with display, whiteboard and AV.", desk: false },
] as const;
export const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
