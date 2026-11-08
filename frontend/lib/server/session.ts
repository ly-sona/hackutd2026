import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { tokenHash } from "./password";
import { snapshot, AccessError } from "./gateway";
export const sessionCookie = "aegis_session";
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 28_800,
};
export async function sessionHash() {
  const value = (await cookies()).get(sessionCookie)?.value;
  return value ? tokenHash(value) : "";
}
export async function requireAccess(
  returnTo: string,
  organizationId = "",
  incidentId = "",
  permission = "organization:view",
) {
  const hash = await sessionHash();
  if (!hash) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  try {
    return await snapshot(hash, organizationId, incidentId, permission);
  } catch (error) {
    if (error instanceof AccessError && error.code === "SESSION_EXPIRED")
      redirect(`/login?state=expired&returnTo=${encodeURIComponent(returnTo)}`);
    throw error;
  }
}
