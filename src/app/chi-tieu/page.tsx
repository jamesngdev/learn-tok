import { getServerDb } from "@/lib/server-db";
import { todayInVN } from "@/lib/expense-date";
import { getDayView } from "@/lib/expenses";
import { ExpenseScreen } from "@/components/ExpenseScreen";

export const dynamic = "force-dynamic";

export default function ChiTieuPage() {
  const today = todayInVN();
  return (
    <main className="phone">
      <ExpenseScreen initial={getDayView(getServerDb(), today)} today={today} />
    </main>
  );
}
