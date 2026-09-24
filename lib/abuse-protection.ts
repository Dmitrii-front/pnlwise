export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = 11 * 1024 * 1024;
export const MAX_API_BODY_BYTES = 100_000;
export const MAX_REPORT_TRANSACTIONS = 5_000;

export const EXPORT_RATE_LIMIT = 30;
export const EXPORT_RATE_WINDOW_SECONDS = 60 * 60;

export const REPORT_PROCESSING_LEASE_MS = 2 * 60 * 1000;

export class RequestBodyTooLargeError extends Error {}

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maxBytes
  )
    throw new RequestBodyTooLargeError();

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.byteLength > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
    length += value.byteLength;
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBoundedRequestText(
  request: Request,
  maxBytes: number,
) {
  return new TextDecoder().decode(
    await readBoundedRequestBody(request, maxBytes),
  );
}

export async function boundedFormData(request: Request, maxBytes: number) {
  const body = await readBoundedRequestBody(request, maxBytes);
  const contentType = request.headers.get("content-type");
  if (!contentType) throw new TypeError("Missing Content-Type");
  return new Response(body, {
    headers: { "Content-Type": contentType },
  }).formData();
}

export const rateLimitSql = {
  increment:
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
};

export const reportProcessingLockSql = {
  acquire:
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires_at=excluded.expires_at WHERE rate_limits.expires_at<=? RETURNING count",
  release: "DELETE FROM rate_limits WHERE key=? AND count=? AND expires_at=?",
};

export function reportProcessingLockKey(reportId: string) {
  return `report-processing:${reportId}`;
}

export function processingLockOwner() {
  return Number.parseInt(
    crypto.randomUUID().replaceAll("-", "").slice(0, 13),
    16,
  );
}
