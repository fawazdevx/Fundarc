import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;

function bytes32Hash(buffer: Buffer) {
  return `0x${createHash("sha256").update(buffer).digest("hex")}`;
}

export async function POST(request: NextRequest) {
  const token = process.env.PINATA_JWT;
  if (!token) {
    return NextResponse.json(
      { error: "Evidence uploads are not configured. Set PINATA_JWT on the server." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload an image or video file." }, { status: 400 });
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return NextResponse.json({ error: "Evidence must be an image or video." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
    return NextResponse.json({ error: "Evidence file must be 50MB or smaller." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const evidenceHash = bytes32Hash(buffer);

  const uploadForm = new FormData();
  uploadForm.set("file", new Blob([buffer], { type: file.type }), file.name || "fundarc-evidence");

  const response = await fetch(PINATA_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: uploadForm,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json(
      { error: payload?.error?.details ?? payload?.error ?? "Failed to upload evidence." },
      { status: response.status }
    );
  }

  const cid = payload.IpfsHash;
  if (!cid) {
    return NextResponse.json({ error: "Upload provider did not return an IPFS CID." }, { status: 502 });
  }

  return NextResponse.json({
    cid,
    uri: `ipfs://${cid}`,
    hash: evidenceHash,
    name: file.name,
    size: file.size,
    type: file.type,
  });
}
