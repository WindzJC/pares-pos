import { useMemo, useState } from "react";
import { getSales, type Sale } from "../lib/storage";
import { addMoney, calcLineTotal, formatPeso } from "../lib/money";

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const History = () => {
  const [sales] = useState<Sale[]>(() => getSales());
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const today = new Date();
  const todaySales = useMemo(
    () => sales.filter((sale) => isSameDay(new Date(sale.paidAt), today)),
    [sales, today]
  );

  const grossTotal = todaySales.reduce((sum, sale) => addMoney(sum, sale.totalDue), 0);
  const selectedSale = todaySales.find((sale) => sale.id === selectedSaleId) ?? null;

  const exportCsv = () => {
    if (todaySales.length === 0) {
      return;
    }

    const rows: string[][] = [
      ["Sale ID", "Time", "Item", "Qty", "Price", "Line Total", "Sale Total"]
    ];

    todaySales.forEach((sale) => {
      const time = new Date(sale.paidAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
      if (sale.lines.length === 0) {
        rows.push([sale.id, time, "", "", "", "", sale.totalDue.toFixed(2)]);
        return;
      }
      sale.lines.forEach((line) => {
        rows.push([
          sale.id,
          time,
          line.name,
          String(line.qty),
          line.price.toFixed(2),
          calcLineTotal(line.price, line.qty).toFixed(2),
          sale.totalDue.toFixed(2)
        ]);
      });
    });

    const escapeCsv = (value: string) => {
      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csv = rows
      .map((row) => row.map((value) => escapeCsv(value)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = today.toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `sales-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">Today Summary</p>
            <h2 className="text-xl font-semibold">Sales</h2>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-100"
          >
            Export Today CSV
          </button>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm font-semibold">
          <div className="flex items-center justify-between">
            <span>Sales Count</span>
            <span>{todaySales.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Gross Total</span>
            <span>{formatPeso(grossTotal)}</span>
          </div>
        </div>

        {todaySales.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            No sales yet today.
          </div>
        ) : (
          <div className="space-y-3">
            {todaySales.map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => setSelectedSaleId(sale.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm font-semibold transition ${
                  selectedSaleId === sale.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span>
                  {new Date(sale.paidAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
                <span>{formatPeso(sale.totalDue)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-500">Sale Details</p>
          <h2 className="text-xl font-semibold">Selected Sale</h2>
        </div>

        {!selectedSale ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            Select a sale to view details.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Paid At</span>
                <span>
                  {new Date(selectedSale.paidAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Total</span>
                <span className="font-semibold">{formatPeso(selectedSale.totalDue)}</span>
              </div>
            </div>

            <div className="space-y-2">
              {selectedSale.lines.map((line) => (
                <div key={line.itemId} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{line.name}</span>
                    <span>{formatPeso(calcLineTotal(line.price, line.qty))}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {line.qty} × {formatPeso(line.price)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold">
              <div className="flex items-center justify-between">
                <span>Cash Received</span>
                <span>{formatPeso(selectedSale.cashReceived)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Change</span>
                <span>{formatPeso(selectedSale.change)}</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default History;
