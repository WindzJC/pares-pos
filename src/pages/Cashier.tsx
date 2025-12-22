import { useMemo, useState } from "react";
import {
  addSale,
  getMenu,
  type Item,
  type Menu,
  type Sale,
  type SaleLine
} from "../lib/storage";
import { calcChange, calcLineTotal, calcSubtotal, formatPeso } from "../lib/money";

const Cashier = () => {
  const [menu] = useState<Menu>(() => getMenu());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    menu.categories[0]?.id ?? ""
  );
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [notes, setNotes] = useState("");
  const [cashReceivedInput, setCashReceivedInput] = useState("");

  const selectedItems = useMemo(() => {
    if (!selectedCategoryId) {
      return [];
    }
    return menu.items.filter(
      (item) => item.active && item.categoryId === selectedCategoryId
    );
  }, [menu.items, selectedCategoryId]);

  const subtotal = calcSubtotal(lines);
  const totalDue = subtotal;
  const cashReceived = Number.isFinite(Number(cashReceivedInput))
    ? Number(cashReceivedInput)
    : 0;
  const change = calcChange(totalDue, cashReceived);
  const canComplete = lines.length > 0 && cashReceived >= totalDue && totalDue > 0;

  const addItemToOrder = (item: Item) => {
    setLines((prev) => {
      const existing = prev.find((line) => line.itemId === item.id);
      if (existing) {
        return prev.map((line) =>
          line.itemId === item.id ? { ...line, qty: line.qty + 1 } : line
        );
      }
      return [...prev, { itemId: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const updateQty = (itemId: string, delta: number) => {
    setLines((prev) => {
      const next = prev
        .map((line) =>
          line.itemId === itemId ? { ...line, qty: line.qty + delta } : line
        )
        .filter((line) => line.qty > 0);
      return next;
    });
  };

  const removeLine = (itemId: string) => {
    setLines((prev) => prev.filter((line) => line.itemId !== itemId));
  };

  const clearCart = () => {
    if (lines.length === 0) {
      return;
    }
    if (window.confirm("Clear the cart?")) {
      setLines([]);
      setNotes("");
      setCashReceivedInput("");
    }
  };

  const completeSale = () => {
    if (!canComplete) {
      return;
    }
    const sale: Sale = {
      id: crypto.randomUUID(),
      paidAt: new Date().toISOString(),
      lines,
      subtotal,
      totalDue,
      cashReceived,
      change
    };
    addSale(sale);
    setLines([]);
    setNotes("");
    setCashReceivedInput("");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">Menu</p>
            <h2 className="text-xl font-semibold">Tap Items</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {menu.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedCategoryId === category.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {selectedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            No active items in this category.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItemToOrder(item)}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="text-base">{item.name}</span>
                <span className="text-xs text-slate-500">{formatPeso(item.price)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Current Order</p>
            <h2 className="text-xl font-semibold">Cart</h2>
          </div>
          <button
            type="button"
            onClick={clearCart}
            className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            Clear Cart
          </button>
        </div>

        <div className="space-y-3">
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              Tap items to start an order.
            </div>
          ) : (
            lines.map((line) => (
              <div
                key={line.itemId}
                className="rounded-xl border border-slate-200 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{line.name}</p>
                    <p className="text-xs text-slate-500">{formatPeso(line.price)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.itemId)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQty(line.itemId, -1)}
                      className="h-9 w-9 rounded-full border border-slate-200 text-lg font-semibold"
                    >
                      -
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-semibold">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(line.itemId, 1)}
                      className="h-9 w-9 rounded-full border border-slate-200 text-lg font-semibold"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-sm font-semibold">{formatPeso(calcLineTotal(line.price, line.qty))}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-600">Order Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm"
            placeholder="Add notes for the kitchen or staff"
          />
        </div>

        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Subtotal</span>
            <span>{formatPeso(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total Due</span>
            <span>{formatPeso(totalDue)}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-sm font-semibold text-slate-600" htmlFor="cash-received">
            Cash Received
          </label>
          <input
            id="cash-received"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cashReceivedInput}
            onChange={(event) => setCashReceivedInput(event.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-base font-semibold"
            placeholder="0.00"
          />
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Change</span>
            <span className={cashReceived >= totalDue ? "text-emerald-600" : "text-slate-500"}>
              {formatPeso(change)}
            </span>
          </div>
          <button
            type="button"
            onClick={completeSale}
            disabled={!canComplete}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:hover:bg-emerald-600"
          >
            Complete Sale
          </button>
        </div>
      </section>
    </div>
  );
};

export default Cashier;
