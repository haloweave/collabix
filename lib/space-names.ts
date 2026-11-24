/** The client's names for each space (2026-11-24), with what kind of space it
 * is, so anyone reading a booking, ticket or invoice knows what they booked:
 * "Origin · Executive Cabin", not just "Origin" or "C-01". Codes stay the
 * internal keys; change a name here and every page follows. */

type Named = { name: string; type: string };

export const SPACE_NAMES: Record<string, Named> = {
  "C-01": { name: "Origin", type: "Executive Cabin" },
  "C-02": { name: "Axis", type: "Executive Cabin" },
  "C-03": { name: "Summit", type: "Executive Cabin" },
  "C-04": { name: "Vertex", type: "4-Seater Meeting Room" },
  "C-05": { name: "Nexus", type: "4-Seater Meeting Room" },
  "M-01": { name: "The Boardroom", type: "8-Seater Conference Room" },
};

/** The micro pods on the floor plan, top to bottom (not bookable online). */
export const POD_NAMES = ["Focus", "Pulse", "Spark"] as const;
export const POD_TYPE = "Micro Pod";

const deskNo = (code: string) => code.replace(/^D-/, "");

/** "Origin", "The Boardroom" or "Desk 07". */
export function spaceName(code: string): string {
  if (code.startsWith("D-")) return `Desk ${deskNo(code)}`;
  return SPACE_NAMES[code]?.name ?? code;
}

/** "Executive Cabin", "4-Seater Meeting Room", "Shared Desk"; "" if unknown. */
export function spaceType(code: string): string {
  if (code.startsWith("D-")) return "Shared Desk";
  return SPACE_NAMES[code]?.type ?? "";
}

/** "Origin · Executive Cabin"; a desk is just "Desk 07". */
export function spaceLabel(code: string): string {
  const named = SPACE_NAMES[code];
  return named ? `${named.name} · ${named.type}` : spaceName(code);
}

/** Several spaces in one line: desks grouped ("Desks 12, 14"), then each room
 * by its label. */
export function spacesText(codes: string[]): string {
  const desks = codes.filter((c) => c.startsWith("D-")).map(deskNo).sort();
  const rooms = codes.filter((c) => !c.startsWith("D-")).sort();
  const parts = [
    desks.length ? `${desks.length === 1 ? "Desk" : "Desks"} ${desks.join(", ")}` : "",
    ...rooms.map(spaceLabel),
  ];
  return parts.filter(Boolean).join(" · ");
}
