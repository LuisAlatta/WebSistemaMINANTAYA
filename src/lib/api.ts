export type ApiRow = Record<string, unknown>;

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(payload.message ?? "No se pudo cargar la información.");
  }
  return response.json() as Promise<T>;
}

export async function sendJson<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  payload: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok)
    throw new Error(body.message ?? "No se pudo guardar el movimiento.");
  return body;
}
