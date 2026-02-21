export function fmtTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts || "");
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function safeParseJsonArray(text: string): any[] {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function mergeLooseTweetItems(prev: any[], added: any[]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();

  const push = (it: any) => {
    const id = String(it?.id ?? "").trim();
    const createdAt = String(it?.created_at ?? it?.createdAt ?? "").trim();
    const text = String(it?.text ?? it?.full_text ?? it?.content ?? "").trim();
    const key = id || (createdAt && text ? `${createdAt}::${text}` : text);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(it);
  };

  prev.forEach(push);
  added.forEach(push);
  return out;
}

function collectTwitterdataInstructionArrays(payload: any): any[][] {
  const out: any[][] = [];
  const seen = new Set<any>();

  const walk = (node: any, depth: number) => {
    if (!node || depth > 10) return;
    if (Array.isArray(node)) return;
    if (typeof node !== "object") return;

    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "instructions" && Array.isArray(v)) {
        if (!seen.has(v)) {
          seen.add(v);
          out.push(v);
        }
        continue;
      }

      if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v, depth + 1);
      }
    }
  };

  walk(payload, 0);
  return out;
}

export function extractCursor(payload: any): string {
  const c =
    payload?.nextCursor ??
    payload?.next_cursor ??
    payload?.cursor ??
    payload?.next?.cursor ??
    payload?.data?.next_cursor ??
    payload?.data?.cursor;
  if (typeof c === "string" && c.trim()) return c.trim();

  for (const instArr of collectTwitterdataInstructionArrays(payload)) {
    for (const inst of instArr) {
      const entries = inst?.entries;
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        const content = e?.content ?? {};
        const cursorType = content?.cursorType;
        const value = content?.value;
        if (cursorType === "Bottom" && typeof value === "string" && value.trim()) return value.trim();
      }
    }
  }

  return "";
}

export function extractTwitterdataRestId(payload: any): string {
  const direct =
    payload?.data?.user?.result?.rest_id ??
    payload?.data?.userResults?.result?.rest_id ??
    payload?.data?.user?.rest_id ??
    payload?.rest_id;

  if (typeof direct === "string" && /^\d+$/.test(direct.trim())) return direct.trim();

  let found = "";

  const walk = (node: any, depth: number) => {
    if (found) return;
    if (!node || depth > 10) return;
    if (Array.isArray(node)) return;
    if (typeof node !== "object") return;

    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "rest_id" && typeof v === "string" && /^\d+$/.test(v.trim())) {
        found = v.trim();
        return;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, depth + 1);
    }
  };

  walk(payload, 0);
  return found;
}

export function extractTwitterdataTweets(payload: any): any[] {
  const out: any[] = [];

  const addTweet = (tweet: any) => {
    const restId = String(tweet?.rest_id ?? tweet?.id_str ?? tweet?.legacy?.id_str ?? "").trim();
    const legacy = tweet?.legacy ?? {};
    const userLegacy = tweet?.core?.user_results?.result?.legacy ?? tweet?.core?.user_results?.result ?? {};
    const screenName = String(userLegacy?.screen_name ?? "").trim();

    const text = String(legacy?.full_text ?? legacy?.text ?? "").trim();
    const createdAt = String(legacy?.created_at ?? "").trim();

    const author = screenName ? `@${screenName}` : undefined;
    const url = screenName && restId ? `https://x.com/${screenName}/status/${restId}` : undefined;

    if (!text) return;

    out.push({
      id: restId || undefined,
      created_at: createdAt || undefined,
      text,
      author,
      url,
    });
  };

  const addEntry = (entry: any) => {
    const content = entry?.content ?? entry;

    const tweet1 = content?.itemContent?.tweet_results?.result;
    if (tweet1) addTweet(tweet1);

    const items = content?.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const tweet2 = it?.item?.itemContent?.tweet_results?.result ?? it?.itemContent?.tweet_results?.result;
        if (tweet2) addTweet(tweet2);
      }
    }

    const modItems = content?.content?.items;
    if (Array.isArray(modItems)) {
      for (const it of modItems) {
        const tweet3 = it?.item?.itemContent?.tweet_results?.result ?? it?.itemContent?.tweet_results?.result;
        if (tweet3) addTweet(tweet3);
      }
    }
  };

  const addInstructions = (instructions: any) => {
    if (!Array.isArray(instructions)) return;
    for (const inst of instructions) {
      const entries = inst?.entries;
      if (!Array.isArray(entries)) continue;
      for (const e of entries) addEntry(e);
    }
  };

  for (const instArr of collectTwitterdataInstructionArrays(payload)) {
    addInstructions(instArr);
  }

  return out;
}
