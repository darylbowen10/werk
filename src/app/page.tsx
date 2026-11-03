import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export default async function Home() {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  redirect(s ? "/play" : "/login");
}
