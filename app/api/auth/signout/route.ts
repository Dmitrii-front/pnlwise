import { api, json, guardOrigin } from "@/lib/server";
import { authClient } from "@/lib/auth";
import { cookies } from "next/headers";
export const POST = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    await (await authClient())?.auth.signOut({ scope: "local" });
    (await cookies()).delete("cl_session");
    return json({ signedOut: true });
  });
