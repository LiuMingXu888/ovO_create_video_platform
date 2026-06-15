import { describe, expect, it } from "vitest";
import { redactSecrets } from "./secretRedactor.js";

describe("redactSecrets", () => {
  it("redacts cookies, authorization headers, token-like fields, and signed URL query values", () => {
    expect(
      redactSecrets({
        headers: {
          cookie: "qijing_session=secret",
          authorization: "Bearer secret",
          "x-safe": "ok"
        },
        body: {
          accessToken: "secret",
          nested: {
            refresh_token: "secret",
            name: "safe"
          },
          fileUrl: "https://example.com/a.mp4?Expires=1&Signature=secret&x-oss-security-token=secret"
        }
      })
    ).toEqual({
      headers: {
        cookie: "[REDACTED]",
        authorization: "[REDACTED]",
        "x-safe": "ok"
      },
      body: {
        accessToken: "[REDACTED]",
        nested: {
          refresh_token: "[REDACTED]",
          name: "safe"
        },
        fileUrl: "https://example.com/a.mp4?Expires=[REDACTED]&Signature=[REDACTED]&x-oss-security-token=[REDACTED]"
      }
    });
  });
});
