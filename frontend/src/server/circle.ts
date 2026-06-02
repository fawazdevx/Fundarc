import { constants, publicEncrypt, randomUUID } from "node:crypto";

const DEFAULT_CIRCLE_API_BASE_URL = "https://api.circle.com";
export const DEFAULT_CIRCLE_BLOCKCHAIN = "ARC-TESTNET";

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function publicKeyToPem(publicKey: string) {
  if (publicKey.includes("BEGIN PUBLIC KEY")) return publicKey;

  const normalized = publicKey.replace(/\s/g, "");
  const lines = normalized.match(/.{1,64}/g)?.join("\n") ?? normalized;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

export async function circleFetch(path: string, init: RequestInit = {}) {
  const apiKey = requiredEnv("CIRCLE_API_KEY");
  const baseUrl = process.env.CIRCLE_API_BASE_URL ?? DEFAULT_CIRCLE_API_BASE_URL;

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-Id": randomUUID(),
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.message ??
      payload?.error?.message ??
      payload?.errors?.[0]?.message ??
      `Circle request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

export async function generateEntitySecretCiphertext() {
  const entitySecret = requiredEnv("CIRCLE_ENTITY_SECRET");
  const payload = await circleFetch("/v1/w3s/config/entity/publicKey");
  const publicKey = payload?.data?.publicKey;

  if (typeof publicKey !== "string" || publicKey.length === 0) {
    throw new Error("Circle did not return an entity public key.");
  }

  const secretBuffer = /^[a-fA-F0-9]{64}$/.test(entitySecret)
    ? Buffer.from(entitySecret, "hex")
    : Buffer.from(entitySecret);

  return publicEncrypt(
    {
      key: publicKeyToPem(publicKey),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    secretBuffer
  ).toString("base64");
}
