import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET!;

/** Build a deterministic R2 key for an ESI PDF */
export function buildEsiKey(fileId: string, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  return `esi/${yyyy}-${mm}-${dd}/${fileId}.pdf`;
}

/** Build a deterministic R2 key for an inspection photo */
export function buildPhotoKey(fileId: string, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  return `photos/${yyyy}-${mm}/${fileId}`;
}

/** Build a deterministic R2 key for a policy PDF */
export function buildPolicyPdfKey(policyId: string): string {
  return `policies/${policyId}.pdf`;
}

/** Presigned URL for client-side direct upload (PUT) */
export async function getPresignedUploadUrl(
  key: string,
  contentType = 'application/pdf',
  expiresInSeconds = 900, // 15 min
): Promise<string> {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

/** Presigned URL for client-side download (GET) */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600, // 60 min
): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/** Fetch file from R2 as a buffer (used by ESI pipeline) */
export async function getObjectAsBuffer(key: string): Promise<Uint8Array> {
  const response = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
