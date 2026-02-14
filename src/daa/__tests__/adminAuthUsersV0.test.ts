import { describe, expect, it } from "vitest";

import {
  getDaaAdminTokensConfiguredV0,
  inferDaaAdminRoleForTokenV0,
  inferDaaAdminTokenKindV0,
} from "../adminAuth";

describe("daa/adminAuth helpers v0", () => {
  it("detects configured env tokens", () => {
    const prev = {
      legacy: process.env.DAA_ADMIN_TOKEN,
      viewer: process.env.DAA_ADMIN_VIEWER_TOKEN,
      editor: process.env.DAA_ADMIN_EDITOR_TOKEN,
    };

    try {
      process.env.DAA_ADMIN_TOKEN = "";
      process.env.DAA_ADMIN_VIEWER_TOKEN = "v";
      process.env.DAA_ADMIN_EDITOR_TOKEN = "";

      expect(getDaaAdminTokensConfiguredV0()).toEqual({ legacy: false, viewer: true, editor: false });
    } finally {
      process.env.DAA_ADMIN_TOKEN = prev.legacy;
      process.env.DAA_ADMIN_VIEWER_TOKEN = prev.viewer;
      process.env.DAA_ADMIN_EDITOR_TOKEN = prev.editor;
    }
  });

  it("infers token kind + role without exposing token values", () => {
    const prev = {
      legacy: process.env.DAA_ADMIN_TOKEN,
      viewer: process.env.DAA_ADMIN_VIEWER_TOKEN,
      editor: process.env.DAA_ADMIN_EDITOR_TOKEN,
    };

    try {
      process.env.DAA_ADMIN_TOKEN = "legacy-1";
      process.env.DAA_ADMIN_VIEWER_TOKEN = "viewer-1";
      process.env.DAA_ADMIN_EDITOR_TOKEN = "editor-1";

      expect(inferDaaAdminTokenKindV0("")).toBe("none");
      expect(inferDaaAdminRoleForTokenV0("")).toBe(null);

      expect(inferDaaAdminTokenKindV0("viewer-1")).toBe("viewer");
      expect(inferDaaAdminRoleForTokenV0("viewer-1")).toBe("viewer");

      expect(inferDaaAdminTokenKindV0("editor-1")).toBe("editor");
      expect(inferDaaAdminRoleForTokenV0("editor-1")).toBe("editor");

      expect(inferDaaAdminTokenKindV0("legacy-1")).toBe("legacy");
      expect(inferDaaAdminRoleForTokenV0("legacy-1")).toBe("editor");

      expect(inferDaaAdminTokenKindV0("nope")).toBe("unknown");
      expect(inferDaaAdminRoleForTokenV0("nope")).toBe(null);
    } finally {
      process.env.DAA_ADMIN_TOKEN = prev.legacy;
      process.env.DAA_ADMIN_VIEWER_TOKEN = prev.viewer;
      process.env.DAA_ADMIN_EDITOR_TOKEN = prev.editor;
    }
  });
});
