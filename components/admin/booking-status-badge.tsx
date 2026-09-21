import { Badge } from "@/components/ui/badge";

// Derive a single human status from the booking + its reservations' live state.
export function BookingStatusBadge({
  status,
  anyConfirmed,
  anyActiveHold,
}: {
  status: "active" | "cancelled";
  anyConfirmed: boolean;
  anyActiveHold: boolean;
}) {
  if (status === "cancelled") return <Badge variant="destructive">Cancelled</Badge>;
  if (anyConfirmed) return <Badge>Confirmed</Badge>;
  if (anyActiveHold) return <Badge variant="secondary">Held</Badge>;
  return <Badge variant="outline">Inactive</Badge>;
}
