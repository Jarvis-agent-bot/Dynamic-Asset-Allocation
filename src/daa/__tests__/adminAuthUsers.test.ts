import { describe, expect, it } from "vitest";

import {
  getDaaAdminTokensConfigured,
  inferDaaAdminRoleForToken,
  inferDaaAdminTokenKind,
} from "../adminAuth";

describe("daa/adminAuth helpers v0", () => {
  it("detects configured env tokens", () => {
    const prev = {
      viewer: process.env.DAA_ADMIN_VIEWER_TOKEN,
      editor: process.env.DAA_ADMIN_EDITOR_TOKEN,
    };

    try {
      process.env.DAA_ADMIN_VIEWER_TOKEN = "v";
      process.env.DAA_ADMIN_EDITOR_TOKEN = "";

      expect(getDaaAdminTokensConfigured()).toEqual({ viewer: true, editor: false });
    } finally {
      process.env.DAA_ADMIN_VIEWER_TOKEN = prev.viewer;
      process.env.DAA_ADMIN_EDITOR_TOKEN = prev.editor;
    }
  });

  it("infers token kind + role without exposing token values", () => {
    const prev = {
      viewer: process.env.DAA_ADMIN_VIEWER_TOKEN,
      editor: process.env.DAA_ADMIN_EDITOR_TOKEN,
    };

    try {
      process.env.DAA_ADMIN_VIEWER_TOKEN = "viewer-1";
      process.env.DAA_ADMIN_EDITOR_TOKEN = "editor-1";

      expect(inferDaaAdminTokenKind("")).toBe("none");
      expect(inferDaaAdminRoleForToken("")).toBe(null);

      expect(inferDaaAdminTokenKind("viewer-1")).toBe("viewer");
      expect(inferDaaAdminRoleForToken("viewer-1")).toBe("viewer");

      expect(inferDaaAdminTokenKind("editor-1")).toBe("editor");
      expect(inferDaaAdminRoleForToken("editor-1")).toBe("editor");

      expect(inferDaaAdminTokenKind("nope")).toBe("unknown");
      expect(inferDaaAdminRoleForToken("nope")).toBe(null);
    } finally {
      process.env.DAA_ADMIN_VIEWER_TOKEN = prev.viewer;
      process.env.DAA_ADMIN_EDITOR_TOKEN = prev.editor;
    }
  });
});
