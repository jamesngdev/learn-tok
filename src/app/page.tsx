import { getServerDb } from "@/lib/server-db";
import { getFeed } from "@/lib/feed";
import { Feed } from "@/components/Feed";

export const dynamic = "force-dynamic";

export default function Home() {
  const page = getFeed(getServerDb(), "news", null, 10);
  return (
    <main className="phone">
      <Feed initial={page} />
    </main>
  );
}
