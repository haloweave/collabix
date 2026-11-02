import { beforeAll, describe, expect, test } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { looksLikeFirebaseToken, verifyFirebasePhoneToken } from "./firebase-phone-token";

const PROJECT = "collabix-test";
const NOW = new Date("2026-11-02T06:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

/** A token shaped like the ones Firebase Auth issues after a phone sign-in. */
async function token(overrides: Record<string, unknown> = {}, key: CryptoKey = privateKey) {
  const claims = {
    phone_number: "+919876543210",
    auth_time: nowSec - 30,
    firebase: { sign_in_provider: "phone", identities: { phone: ["+919876543210"] } },
    ...overrides,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT)
    .setSubject("firebase-uid-1")
    .setIssuedAt(nowSec - 30)
    .setExpirationTime(nowSec + 3600)
    .sign(key);
}

const opts = () => ({ projectId: PROJECT, jwks, now: NOW });

describe("verifyFirebasePhoneToken", () => {
  test("accepts a fresh token for the same Indian mobile", async () => {
    expect(await verifyFirebasePhoneToken(await token(), "+919876543210", opts())).toBe(true);
  });

  test("matches the number however the form wrote it", async () => {
    expect(await verifyFirebasePhoneToken(await token(), "9876543210", opts())).toBe(true);
  });

  test("refuses a token for a different number", async () => {
    expect(await verifyFirebasePhoneToken(await token(), "+919876543211", opts())).toBe(false);
  });

  test("refuses a token from another Firebase project", async () => {
    const bad = await token();
    expect(await verifyFirebasePhoneToken(bad, "+919876543210", { ...opts(), projectId: "someone-else" })).toBe(false);
  });

  test("refuses a token not signed by Google's keys", async () => {
    expect(await verifyFirebasePhoneToken(await token({}, otherKey), "+919876543210", opts())).toBe(false);
  });

  test("refuses a sign-in older than ten minutes", async () => {
    const stale = await token({ auth_time: nowSec - 11 * 60 });
    expect(await verifyFirebasePhoneToken(stale, "+919876543210", opts())).toBe(false);
  });

  test("refuses a token from a non-phone sign-in", async () => {
    const google = await token({ firebase: { sign_in_provider: "google.com" } });
    expect(await verifyFirebasePhoneToken(google, "+919876543210", opts())).toBe(false);
  });

  test("refuses garbage without throwing", async () => {
    expect(await verifyFirebasePhoneToken("not.a.jwt", "+919876543210", opts())).toBe(false);
  });

  test("refuses when no project is configured", async () => {
    expect(await verifyFirebasePhoneToken(await token(), "+919876543210", { ...opts(), projectId: "" })).toBe(false);
  });
});

describe("looksLikeFirebaseToken", () => {
  test("tells a JWT apart from a 6-digit SMS code", async () => {
    expect(looksLikeFirebaseToken(await token())).toBe(true);
    expect(looksLikeFirebaseToken("123456")).toBe(false);
  });
});
