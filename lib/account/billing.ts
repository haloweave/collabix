import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export type BillingDetails = { companyName: string; gstin: string; address: string };

export async function getBillingProfile(userId: string): Promise<BillingDetails> {
  const [row] = await db
    .select()
    .from(schema.billingProfile)
    .where(eq(schema.billingProfile.userId, userId));
  return {
    companyName: row?.companyName ?? "",
    gstin: row?.gstin ?? "",
    address: row?.address ?? "",
  };
}
