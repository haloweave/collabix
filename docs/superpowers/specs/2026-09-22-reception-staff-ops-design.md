# Milestone A — Reception & staff ops

Date: 2026-09-22
Status: approved, building

Closes audit gaps #1 (reception/front-desk), #2 (member management writes),
#6 (scoped reception role). Part of the larger admin fill-order; Settings (B),
Membership (C) and Billing (D) follow as their own cycles.

## Decisions

- Reception lives **inside the admin panel** at `/admin/reception` (no separate
  `/staff` surface).
- Check-in is a **manual staff button** (no QR/kiosk yet); timestamps stored on
  the reservation.
- Staff-created members are **just a record** (no invite email sent); they can
  OTP-sign-in later with that email.

## Schema (one migration)

- `user.notes` — text, nullable. CRM notes.
- `reservation.checked_in_at`, `reservation.checked_out_at` — timestamptz,
  nullable. Attendance.
- new `visitor` table: `id, name, company?, host, purpose?, phone?,
  checked_in_at (default now), checked_out_at?, created_by (actor email),
  created_at`.

## Scoped RBAC (two tiers)

- Add `reception` to the staff roles. Introduce `MANAGER_ROLES = [manager,
  owner]` and a `requireManager()` guard.
- **Operational** (`requireStaff`: reception, staff, manager, owner):
  Reception, Bookings, Calendar, Members, Inventory.
- **Config/finance** (`requireManager`: manager, owner): Rate plans, Reports,
  Audit (and future Settings/Membership/Billing).
- Sidebar filters nav items by tier; manager-only pages call `requireManager`
  and redirect operational-only roles back to `/admin`.

## Reception board (`/admin/reception`, requireStaff)

1. *Here today* — today's confirmed bookings, each with Check in / Check out
   buttons that stamp `checked_in_at` / `checked_out_at` on the booking's
   reservations; shows live checked-in state.
2. *Visitors* — today's visitor rows with a Sign-in form and Sign-out buttons.

## Member writes

- Actions: `createMember` (name/email/phone/role/notes; unique-email handled),
  `updateMemberNotes`, `updateMemberRole` (role change gated to `requireManager`).
- Members list: Add-member button → `/admin/members/new`.
- Member detail: editable notes + role selector (role selector manager+ only).

## Cross-cutting

Every mutation reuses the existing `logAudit`, `revalidatePath`, and guard
patterns — no new infrastructure. New audit actions: `booking.check_in`,
`booking.check_out`, `visitor.sign_in`, `visitor.sign_out`, `member.create`,
`member.update_notes`, `member.update_role`.

## Verification

typecheck + production build + curl smoke tests on `/admin/reception`,
`/admin/members/new`, and member-detail writes; DB checks that check-in
timestamps and visitor rows persist.
