import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { Env } from "./types";

export type VapidPair = {
  publicKey: string;
  privateKey: string;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function createVapidPair(): Promise<VapidPair> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const x = base64UrlToBytes(jwk.x!);
  const y = base64UrlToBytes(jwk.y!);
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 4;
  uncompressed.set(x, 1);
  uncompressed.set(y, 33);
  return {
    publicKey: bytesToBase64Url(uncompressed),
    privateKey: jwk.d!,
  };
}

export async function getVapidPair(db: D1Database): Promise<VapidPair> {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = 'vapid'").first<{ value: string }>();
  if (row?.value) return JSON.parse(row.value) as VapidPair;
  const keys = await createVapidPair();
  await db.prepare("INSERT INTO app_settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
  return keys;
}

function rewriteFcmAuth(authorization: string, publicKey: string) {
  if (authorization.startsWith("WebPush ")) {
    return `vapid t=${authorization.slice(8)}, k=${publicKey}`;
  }
  return authorization;
}

export async function sendWebPushes(env: Env, userId: number, title: string, body: string) {
  let keys: VapidPair;
  try {
    keys = await getVapidPair(env.DB);
  } catch (err) {
    console.error("vapid keys unavailable", err);
    return;
  }
  const { results } = await env.DB
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .bind(userId)
    .all<{ endpoint: string; p256dh: string; auth: string }>();
  if (!results?.length) return;

  const subject = env.APP_URL ? env.APP_URL.replace(/\/$/, "") : "mailto:noreply@example.com";
  const url = env.APP_URL?.replace(/\/$/, "") || "/";

  for (const sub of results) {
    try {
      const payload = await buildPushPayload(
        { data: { title, body, url }, options: { ttl: 60 * 60 * 24, urgency: "high" } },
        { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      );
      const headers = new Headers();
      for (const [key, value] of Object.entries(payload.headers)) {
        if (value) headers.set(key, String(value));
      }
      const auth = headers.get("authorization");
      if (auth) headers.set("authorization", rewriteFcmAuth(auth, keys.publicKey));
      const payloadBody = new Uint8Array(payload.body.byteLength);
      payloadBody.set(payload.body);
      const res = await fetch(sub.endpoint, { method: payload.method, headers, body: payloadBody });
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(sub.endpoint).run();
      } else if (!res.ok) {
        console.error("web push failed", res.status, await res.text());
      }
    } catch (err) {
      console.error("web push failed", err);
    }
  }
}
