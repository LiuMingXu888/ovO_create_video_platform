import { describe, expect, it } from "vitest";
import { createStoragePaths } from "./storagePaths.js";

describe("createStoragePaths", () => {
  it("keeps private API and auth material under the app storage root", () => {
    expect(createStoragePaths("/tmp/ovo-test")).toEqual({
      rootDir: "/tmp/ovo-test",
      authDir: "/tmp/ovo-test/auth",
      storageStatePath: "/tmp/ovo-test/auth/storage-state.json",
      apiDir: "/tmp/ovo-test/api",
      capturesDir: "/tmp/ovo-test/api/captures",
      sanitizedApiMapPath: "/tmp/ovo-test/api/sanitized-api-map.json",
      assetsDir: "/tmp/ovo-test/assets",
      outputsDir: "/tmp/ovo-test/outputs"
    });
  });
});
