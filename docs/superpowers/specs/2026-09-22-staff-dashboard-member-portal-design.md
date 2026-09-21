# Staff dashboard + Member portal

Date: 2026-09-22
Status: approved, building

Two new surfaces. Reuses existing bookings/reservations/invoices data and the
reception/walk-in/member components.

## Decisions

- Member portal login is **demo-only** for now: enter a phone number (any), no
  real OTP — gated by `MEMBER_AUTH_DEMO` so the real phone-OTP path can replace
  it later. Lightweight signed cookie session, not Better Auth.
- Reception role lands on **/staff only** and is bounced from /admin.
- Portal scope: my bookings (upcoming + past), cancel my upcoming, invoices
  (read-only), edit profile.

## A. RBAC / routing

- Add `requireAdminAccess()` = staff|manager|owner (reception → redirect
  `/staff`; anon → `/admin/login`). Used by the /admin (dash) layout.
- `requireStaff()` (reception|staff|manager|owner) guards `/staff`.
- Under `ADMIN_AUTH_DISABLED` both return the dev owner (everything open).

## B. Staff dashboard — `/staff`

- `app/staff/layout.tsx`: `requireStaff`, `.admin-scope` surface, a light top
  bar (brand · tabs Reception / New walk-in / Members · sign out), Toaster.
- `app/staff/page.tsx`: here-today check-in/out + visitor log (extract a shared
  `ReceptionBoard` component reused by `/admin/reception`).
- `app/staff/new/page.tsx`: walk-in booking (reuse `WalkInForm`).
- `app/staff/members/page.tsx`: member search + add + basic view (reuse
  `listMembers`, `MemberForm`).

## C. Member portal — `/account`

- Demo auth: `lib/account/auth.ts` — `getMemberSession()` reads a `member_id`
  cookie → user; `requireMember()` redirects to `/account/login`.
- `app/account/layout.tsx` guardless surface + Toaster; `app/account/login`
  public (phone → cookie → `/account`); `app/account/(portal)/layout.tsx`
  guarded with header nav (Bookings / Invoices / Profile / sign out).
- Pages: `(portal)/page.tsx` my bookings (upcoming + past) + cancel-upcoming;
  `(portal)/invoices` read-only; `(portal)/profile` edit name.
- Actions (`app/account/actions.ts`): `demoMemberLogin(phone)`,
  `memberSignOut()`, `cancelOwnBooking(id)` (re-checks ownership +
  future start before releasing seats), `updateOwnProfile(name)`.
- Ownership: bookings matched by `member_id = session user.id` OR captured
  email.

## Verification

typecheck + build + curl each route; Chrome MCP: log into `/account` with a
phone used in an earlier browser booking and confirm that booking appears and
can be cancelled; confirm `/staff` board renders.
