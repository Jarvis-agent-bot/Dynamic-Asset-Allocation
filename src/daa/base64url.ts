// Minimal base64url helpers (UTF-8 safe) for share links.
//
// Note: Prefer Buffer when available (Node/test), and fall back to browser APIs
// (TextEncoder/TextDecoder + btoa/atob) in client components.

function toUtf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(s, "utf8"));
  throw new Error("No UTF-8 encoder available");
}

function fromUtf8Bytes(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("utf8");
  throw new Error("No UTF-8 decoder available");
}

function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  if (typeof btoa !== "undefined") {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
    return btoa(bin);
  }
  throw new Error("No base64 encoder available");
}

function base64Decode(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(b64, "base64"));
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  throw new Error("No base64 decoder available");
}

export function base64UrlEncodeUtf8(s: string): string {
  const b64 = base64Encode(toUtf8Bytes(s));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecodeUtf8(token: string): string {
  const clean = String(token || "").trim();
  if (!clean) throw new Error("empty token");

  const b64 = clean.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bytes = base64Decode(b64 + pad);
  return fromUtf8Bytes(bytes);
}
