import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

function normalize(p: string) {
  return p.replace(/\\/g, "/");
}

describe("workbench-import-graph-v1", () => {
  it("route、read service 与 tests 不再直接引用旧 workbenchServiceV1", () => {
    const root = process.cwd();
    const candidates = [
      ...walkFiles(path.join(root, "app/api/daa")),
      ...walkFiles(path.join(root, "src/daa/modules/read")),
      ...walkFiles(path.join(root, "src/daa"))
        .filter((file) => normalize(file).includes("/__tests__/")),
    ];

    const offenders = candidates
      .map((file) => ({ file, content: fs.readFileSync(file, "utf8") }))
      .filter(({ file, content }) => !normalize(file).endsWith("/src/daa/__tests__/workbenchImportGraphV1.test.ts") && content.includes("workbenchServiceV1"))
      .map(({ file }) => normalize(path.relative(root, file)));

    expect(offenders).toEqual([]);
  });
});
