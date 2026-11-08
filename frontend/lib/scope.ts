export * from "../../shared/scope";
export async function readScope<T>(
  scope: { organizationId: string; incidentId: string },
  operation: string,
  query: Record<string, string | number> = {},
): Promise<T> {
  const response = await fetch(
    `/api/scope?${new URLSearchParams({ ...scope, operation, ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) })}`,
    { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
