import { describe, expect, it } from "vitest";
import { extractCreditBalance } from "./credits";

describe("extractCreditBalance", () => {
  it("extracts direct credit-like numeric fields", () => {
    expect(extractCreditBalance({ credits: 23136 })).toBe(23136);
    expect(extractCreditBalance({ credit: "23136" })).toBe(23136);
    expect(extractCreditBalance({ points: 23136 })).toBe(23136);
    expect(extractCreditBalance({ balance: "23,136" })).toBe(23136);
    expect(extractCreditBalance({ remainingCredits: 23136 })).toBe(23136);
  });

  it("extracts nested balances from auth payloads", () => {
    expect(
      extractCreditBalance({
        user: {
          account: "23136",
          wallet: {
            remainingCredits: "23136"
          }
        }
      })
    ).toBe(23136);
  });

  it("ignores unrelated account and id numbers", () => {
    expect(
      extractCreditBalance({
        account: "23136",
        id: 23136,
        profile: {
          userId: "23136"
        }
      })
    ).toBeUndefined();
  });
});
