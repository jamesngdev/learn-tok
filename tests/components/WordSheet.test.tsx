import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WordSheet } from "@/components/WordSheet";
import { MyWordsProvider } from "@/components/MyWordsContext";

function fakeFetch(entry: any): typeof fetch {
  return (async () => new Response(JSON.stringify(entry))) as unknown as typeof fetch;
}

describe("WordSheet", () => {
  it("loads and displays the Vietnamese meaning", async () => {
    render(
      <MyWordsProvider>
        <WordSheet
          word="galaxy"
          onClose={() => {}}
          fetchImpl={fakeFetch({ word: "galaxy", ipa: "/x/", pos: "noun", meaning_vi: "thiên hà" })}
        />
      </MyWordsProvider>
    );
    await waitFor(() => expect(screen.getByText("thiên hà")).toBeInTheDocument());
    expect(screen.getByText("/x/")).toBeInTheDocument();
  });

  it("marks saved after clicking add", async () => {
    const saveFetch = vi.fn(fakeFetch({ ok: true }));
    render(
      <MyWordsProvider>
        <WordSheet
          word="galaxy"
          onClose={() => {}}
          fetchImpl={fakeFetch({ word: "galaxy", ipa: null, pos: null, meaning_vi: "thiên hà" })}
        />
      </MyWordsProvider>
    );
    await waitFor(() => screen.getByText("thiên hà"));
    // Provider.save uses global fetch; stub it.
    vi.stubGlobal("fetch", saveFetch);
    fireEvent.click(screen.getByText(/Add to My Words/));
    await waitFor(() => expect(screen.getByText(/Saved to My Words/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
