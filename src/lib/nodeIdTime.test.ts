import { describe, expect, it } from "vitest";
import { decodeNodeIdTime } from "./nodeIdTime";

describe("decodeNodeIdTime", () => {
  it("decodes the base36 middle segment of a real node id to a sane 2026 ms timestamp", () => {
    // img-mqlzutvc-uek5p2z → mqlzutvc → 2026-06-20T06:46:05.496Z
    const ms = decodeNodeIdTime("img-mqlzutvc-uek5p2z");
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).toISOString()).toBe("2026-06-20T06:46:05.496Z");
  });

  it("works across kinds (aud/vid/subrm prefixes)", () => {
    expect(decodeNodeIdTime("vid-mqlzuse5-12sgw5o")).toBe(1781937963581);
    expect(decodeNodeIdTime("aud-mqlzuqxs-ki9o6c8")).toBe(1781937961696);
  });

  it("returns null for uuid-style local placeholder ids (no base36 time segment)", () => {
    expect(decodeNodeIdTime("generated-image-7b3f9c2a-1d4e-4f8a-9b2c-0e1f2a3b4c5d")).toBeNull();
  });

  it("returns null when the decoded time is out of the sane window", () => {
    expect(decodeNodeIdTime("img-zzzzzzzzzzzz-abc")).toBeNull(); // 远未来
    expect(decodeNodeIdTime("img-1-abc")).toBeNull(); // 1970 附近，太早
  });

  it("returns null for ids without a middle segment", () => {
    expect(decodeNodeIdTime("singletoken")).toBeNull();
    expect(decodeNodeIdTime("")).toBeNull();
  });
});
