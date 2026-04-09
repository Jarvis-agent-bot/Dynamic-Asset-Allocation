/**
 * Prompt 安全：移除可能造成 prompt injection 的字符。
 */
export function sanitizeForPrompt(value: string, maxLen = 100): string {
  return value
    .replace(/[`\[\]\n\r]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLen);
}
