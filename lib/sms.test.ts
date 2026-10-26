import { describe, expect, test } from "vitest";
import { otpMessage, sendOtpSms, toIndianMobile } from "./sms";

function fakeFetch(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("toIndianMobile", () => {
  test("accepts +91 and bare 10-digit Indian mobiles", () => {
    expect(toIndianMobile("+919876543210")).toBe("9876543210");
    expect(toIndianMobile("9876543210")).toBe("9876543210");
    expect(toIndianMobile("+91 98765 43210")).toBe("9876543210");
  });
  test("rejects non-Indian and malformed numbers", () => {
    expect(toIndianMobile("+14155550123")).toBeNull();
    expect(toIndianMobile("12345")).toBeNull();
    expect(toIndianMobile("+915876543210")).toBeNull(); // Indian mobiles start 6–9
  });
});

describe("sendOtpSms", () => {
  test("posts the code to Fast2SMS Quick SMS with the API key", async () => {
    const { impl, calls } = fakeFetch({ return: true, request_id: "x", message: ["SMS sent successfully."] });
    await sendOtpSms("+919876543210", "482913", { apiKey: "KEY", fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://www.fast2sms.com/dev/bulkV2");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("KEY");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      route: "q",
      message: otpMessage("482913"),
      numbers: "9876543210",
    });
  });

  test("the message carries the code and the brand", () => {
    expect(otpMessage("482913")).toContain("482913");
    expect(otpMessage("482913")).toContain("Collabix");
  });

  test("a Fast2SMS refusal is an error, not a silent success", async () => {
    const { impl } = fakeFetch({ return: false, status_code: 412, message: "Invalid Authentication" }, 412);
    await expect(sendOtpSms("+919876543210", "1", { apiKey: "KEY", fetchImpl: impl })).rejects.toThrow(/sms_failed/);
  });

  test("a non-Indian number is refused before any request", async () => {
    const { impl, calls } = fakeFetch({ return: true });
    await expect(sendOtpSms("+14155550123", "1", { apiKey: "KEY", fetchImpl: impl })).rejects.toThrow(/invalid_phone/);
    expect(calls).toHaveLength(0);
  });

  test("without a key in production it refuses instead of pretending", async () => {
    await expect(sendOtpSms("+919876543210", "1", { apiKey: "", production: true })).rejects.toThrow(/sms_not_configured/);
  });
});
