// Presentation helpers for the admin panel. Money is stored in integer paise;
// all times are rendered in the venue's timezone (Asia/Kolkata).

const IST = "Asia/Kolkata";

export const rupees = (minor: number) =>
  `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;

export const istDateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: IST,
  }).format(new Date(d));

export const istDate = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: IST,
  }).format(new Date(d));

export const istTime = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: IST,
  }).format(new Date(d));
