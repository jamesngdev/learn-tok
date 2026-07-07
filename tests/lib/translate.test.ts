import { describe, it, expect } from "vitest";
import { translateToVi } from "@/lib/translate";

function okFetch(): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({ responseData: { translatedText: "thiên hà" } })
    )) as unknown as typeof fetch;
}
function errFetch(): typeof fetch {
  return (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
}

describe("translateToVi", () => {
  it("returns the translated text", async () => {
    expect(await translateToVi("galaxy", okFetch())).toBe("thiên hà");
  });
  it("returns null on error", async () => {
    expect(await translateToVi("galaxy", errFetch())).toBeNull();
  });
});
