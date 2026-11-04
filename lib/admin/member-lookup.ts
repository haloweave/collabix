import "server-only";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as authSchema from "@/lib/db/auth-schema";
import { toIndianMobile } from "@/lib/sms";

/** "98765 43210" or "+91 98765 43210" → "+919876543210", the form accounts
 * store numbers in (as the phone sign-in creates them); null if not a valid
 * Indian mobile. */
export function toAccountPhone(phone: string): string | null {
  const mobile = toIndianMobile(phone);
  return mobile ? `+91${mobile}` : null;
}

/** The account a booking made at the front desk belongs to: the one whose
 * email or mobile matches, so it shows up when the customer signs in. */
export async function findMemberByContact(email: string, phone: string | null): Promise<string | null> {
  const [member] = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(
      phone
        ? or(eq(authSchema.user.email, email), eq(authSchema.user.phoneNumber, phone))
        : eq(authSchema.user.email, email),
    )
    .limit(1);
  return member?.id ?? null;
}
