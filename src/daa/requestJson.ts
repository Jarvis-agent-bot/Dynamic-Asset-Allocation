export type ReadJsonOk<T> = { ok: true; value: T; rawText: string };
export type ReadJsonErr = { ok: false; error: string };

export async function readJsonBody<T>(req: Request): Promise<ReadJsonOk<T> | ReadJsonErr> {
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return { ok: false, error: "failed to read request body" };
  }

  if (!bodyText.trim()) return { ok: false, error: "empty request body" };

  try {
    return { ok: true, value: JSON.parse(bodyText) as T, rawText: bodyText };
  } catch {
    return { ok: false, error: "request body must be valid JSON" };
  }
}
