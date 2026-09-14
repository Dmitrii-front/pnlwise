export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const parts = header.split(",");
  const time = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (
    !time ||
    !/^[0-9]+$/.test(time) ||
    Math.abs(now / 1000 - Number(time)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${time}.${payload}`);
  for (const s of signatures) {
    if (!/^[a-f0-9]{64}$/.test(s)) continue;
    const bytes = Uint8Array.from(s.match(/../g)!, (x) => parseInt(x, 16));
    if (await crypto.subtle.verify("HMAC", key, bytes, data)) return true;
  }
  return false;
}
