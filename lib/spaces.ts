/** Indicative demo rates; replace with server-owned rate plans before checkout. */
export const spaces = [
  { key: "hotdesk", name: "Hot Desk", rate: 120, capacity: 1, image: "openoffice.jpg", description: "A flexible seat in the open lounge.", desk: true },
  { key: "dedicated", name: "Dedicated Desk", rate: 200, capacity: 1, image: "desk.jpg", description: "Your own reserved desk with lockable storage.", desk: true },
  { key: "cabin", name: "Private Cabin", rate: 600, capacity: 4, image: "cabin.jpg", description: "An enclosed, acoustic cabin for focused teamwork.", desk: false },
  { key: "meeting", name: "Meeting Room", rate: 900, capacity: 8, image: "meeting.jpg", description: "An eight-seat boardroom with display, whiteboard and AV.", desk: false },
] as const;
export const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
