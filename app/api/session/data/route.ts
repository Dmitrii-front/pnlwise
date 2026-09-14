import { accountUser, authClient } from "@/lib/auth";
import { api, json, guardOrigin, db, session } from "@/lib/server";
import { cookies } from "next/headers";
export const DELETE = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    const owner = await session(true);
    const user = await accountUser();
    await db()
      .prepare("DELETE FROM reports WHERE session_hash=? OR user_id=?")
      .bind(owner, user?.id || "")
      .run();
    await (await authClient())?.auth.signOut({ scope: "local" });
    (await cookies()).delete("cl_session");
    return json({ deleted: true });
  });
