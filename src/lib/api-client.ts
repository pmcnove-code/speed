/**
 * Fetch JSON from an API endpoint with error handling.
 * Ensures server error messages are never lost, and throws with a meaningful error.
 */
export async function apiJson<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  let message = `Request failed (${res.status})`;
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    message = body.error;
  }
  if (!res.ok) {
    throw Object.assign(new Error(message), {
      status: res.status,
      body,
    });
  }

  return body as T;
}
