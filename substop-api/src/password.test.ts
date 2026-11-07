import { pbkdf2Sync } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { PBKDF2_ITERATIONS, hashPassword, newSessionToken, pbkdf2Sha256, sha256Hex, verifyPassword } from "./password.ts";

test("PBKDF2-SHA256 matches Node at 100k iterations", async () => {
  assert.equal(PBKDF2_ITERATIONS, 100_000);
  const salt = new TextEncoder().encode("salt-substop-16b");
  assert.equal(salt.byteLength, 16);
  const actual = await pbkdf2Sha256("password", salt, PBKDF2_ITERATIONS);
  const expected = pbkdf2Sync("password", salt, PBKDF2_ITERATIONS, 32, "sha256");
  assert.equal(Buffer.from(actual).equals(expected), true);

  const stored = await hashPassword("password", salt);
  assert.equal(stored.saltHex, Buffer.from(salt).toString("hex"));
  assert.equal(stored.hashHex, expected.toString("hex"));
  assert.equal(await verifyPassword("password", stored.saltHex, stored.hashHex), true);
  assert.equal(await verifyPassword("password!", stored.saltHex, stored.hashHex), false);
});

test("each password gets its own salt and a fresh session token hashes differently", async () => {
  const first = await hashPassword("correct horse");
  const second = await hashPassword("correct horse");
  assert.notEqual(first.saltHex, second.saltHex);
  assert.notEqual(first.hashHex, second.hashHex);
  assert.equal(first.hashHex.length, 64);
  assert.equal(first.saltHex.length, 32);

  const token = newSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const hash = await sha256Hex(token);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.notEqual(newSessionToken(), token);
});
