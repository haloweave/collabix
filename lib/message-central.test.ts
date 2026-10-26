import { describe, expect, test } from "vitest";
import { sendVerification, validateVerification } from "./message-central";

function fakeFetch(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const creds = { customerId: "C-TEST", authToken: "TOKEN" };

describe("sendVerification", () => {
  test("asks Message Central to text a 6-digit code and returns the verification id", async () => {
    const { impl, calls } = fakeFetch({ responseCode: 200, message: "SUCCESS", data: { verificationId: "4242" } });
    const id = await sendVerification("+919876543210", { ...creds, fetchImpl: impl });
    expect(id).toBe("4242");
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://cpaas.messagecentral.com/verification/v3/send");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      countryCode: "91",
      customerId: "C-TEST",
      flowType: "SMS",
      mobileNumber: "9876543210",
      otpLength: "6",
    });
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).authToken).toBe("TOKEN");
  });

  test("a refusal is an error", async () => {
    const { impl } = fakeFetch({ responseCode: 501, message: "INVALID_CUSTOMER_ID" }, 400);
    await expect(sendVerification("+919876543210", { ...creds, fetchImpl: impl })).rejects.toThrow(/otp_send_failed/);
  });

  test("a non-Indian number is refused before any request", async () => {
    const { impl, calls } = fakeFetch({});
    await expect(sendVerification("+14155550123", { ...creds, fetchImpl: impl })).rejects.toThrow(/invalid_phone/);
    expect(calls).toHaveLength(0);
  });
});

describe("validateVerification", () => {
  test("a completed verification is accepted", async () => {
    const { impl, calls } = fakeFetch({ responseCode: 200, data: { verificationStatus: "VERIFICATION_COMPLETED" } });
    expect(await validateVerification("4242", "123456", { ...creds, fetchImpl: impl })).toBe(true);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/verification/v3/validateOtp");
    expect(url.searchParams.get("verificationId")).toBe("4242");
    expect(url.searchParams.get("code")).toBe("123456");
    expect((calls[0].init.headers as Record<string, string>).authToken).toBe("TOKEN");
  });

  test("accepts Message Central's real success reply (captured 2026-10-26)", async () => {
    const { impl } = fakeFetch({
      responseCode: 200,
      message: "SUCCESS",
      data: {
        verificationId: 13268883,
        mobileNumber: "<redacted>",
        verificationStatus: "VERIFICATION_COMPLETED",
        responseCode: "200",
        errorMessage: null,
        transactionId: "<redacted>",
        referenceId: "JRN-d1c9cd04",
        authToken: "<redacted>",
      },
    });
    expect(await validateVerification("13268883", "637050", { ...creds, fetchImpl: impl })).toBe(true);
  });

  test("a response code sent as text still counts", async () => {
    const { impl } = fakeFetch({ responseCode: "200", data: { verificationStatus: "VERIFICATION_COMPLETED" } });
    expect(await validateVerification("1", "123456", { ...creds, fetchImpl: impl })).toBe(true);
  });

  test("ALREADY_VERIFIED is not a pass (no replay of a used verification)", async () => {
    const { impl } = fakeFetch({ responseCode: 703, message: "ALREADY_VERIFIED" });
    expect(await validateVerification("1", "999999", { ...creds, fetchImpl: impl })).toBe(false);
  });

  test("a wrong or expired code is rejected, not thrown", async () => {
    for (const responseCode of [702, 705]) {
      const { impl } = fakeFetch({ responseCode, message: "WRONG_OTP_PROVIDED" }, 400);
      expect(await validateVerification("4242", "000000", { ...creds, fetchImpl: impl })).toBe(false);
    }
  });
});
