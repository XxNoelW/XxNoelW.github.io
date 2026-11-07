export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

type SubtleWithTiming = SubtleCrypto & {
  timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean;
};

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const left = copyBytes(a);
  const right = copyBytes(b);
  const subtle = crypto.subtle as SubtleWithTiming;
  if (typeof subtle.timingSafeEqual === "function") {
    if (left.byteLength !== right.byteLength) {
      subtle.timingSafeEqual(left, left);
      return false;
    }
    return subtle.timingSafeEqual(left, right);
  }
  const length = Math.max(left.byteLength, right.byteLength);
  let diff = left.byteLength === right.byteLength ? 0 : 1;
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export async function pbkdf2Sha256(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", copyBytes(new TextEncoder().encode(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: copyBytes(salt),
      iterations,
    },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, salt?: Uint8Array): Promise<{ hashHex: string; saltHex: string }> {
  const saltBytes = salt ? copyBytes(salt) : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  if (saltBytes.byteLength !== SALT_BYTES) throw new Error("salt must be 16 bytes");
  const hash = await pbkdf2Sha256(password, saltBytes, PBKDF2_ITERATIONS);
  return { hashHex: bytesToHex(hash), saltHex: bytesToHex(saltBytes) };
}

export async function verifyPassword(password: string, saltHex: string, hashHex: string): Promise<boolean> {
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  if (!salt || !expected || salt.byteLength !== SALT_BYTES || expected.byteLength !== HASH_BITS / 8) return false;
  const actual = await pbkdf2Sha256(password, salt, PBKDF2_ITERATIONS);
  return timingSafeEqual(actual, expected);
}

export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}
