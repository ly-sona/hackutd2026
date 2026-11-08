export async function api<T = { ok: boolean }>(path: string, body: object): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'The request could not be completed.');
  return data as T;
}
