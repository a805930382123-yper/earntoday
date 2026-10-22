import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { test } from "node:test";
import { verifySignature } from "./prepare-release.mjs";

test("release gate accepts signed installer and rejects tampering, wrong key, wrong version and forged notes", () => {
  // Test-only ephemeral keys, in memory; never production signing keys.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const id = Buffer.from("test-key");
  const rawKey = Buffer.concat([Buffer.from("Ed"), id, publicKey.export({ type: "spki", format: "der" }).subarray(-32)]);
  const encodedKey = Buffer.from(`untrusted comment: test public key\n${rawKey.toString("base64")}\n`).toString("base64");
  const payload = Buffer.from("synthetic installer bytes");
  const signature = sign(null, createHash("blake2b512").update(payload).digest(), privateKey);
  const comment = "timestamp:1\tfile:test.exe\tversion:0.3.0";
  const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
  const text = `untrusted comment: test signature\n${Buffer.concat([Buffer.from("ED"), id, signature]).toString("base64")}\ntrusted comment: ${comment}\n${global.toString("base64")}\n`;
  const encoded = Buffer.from(text).toString("base64");
  verifySignature(payload, encoded, encodedKey, "0.3.0");
  assert.throws(() => verifySignature(Buffer.from("altered"), encoded, encodedKey, "0.3.0"));
  assert.throws(() => verifySignature(payload, encoded, encodedKey, "0.4.0"));
  const wrong = Buffer.from(rawKey); wrong[12] ^= 1;
  const wrongKey = Buffer.from(`untrusted comment: test\n${wrong.toString("base64")}\n`).toString("base64");
  assert.throws(() => verifySignature(payload, encoded, wrongKey, "0.3.0"));
  const forged = Buffer.from(text.replace("file:test.exe", "file:forged.exe")).toString("base64");
  assert.throws(() => verifySignature(payload, forged, encodedKey, "0.3.0"));
});
