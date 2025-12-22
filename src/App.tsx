import { useState } from "react";
import Cashier from "./pages/Cashier";
import History from "./pages/History";
import MenuEditor from "./pages/MenuEditor";

type Tab = "cashier" | "history" | "menu";

const tabs: { id: Tab; label: string }[] = [
  { id: "cashier", label: "Cashier" },
  { id: "history", label: "History" },
  { id: "menu", label: "Menu" }
];

const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>("cashier");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-lg font-semibold">Pares POS</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Offline Single Device</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {activeTab === "cashier" && <Cashier />}
        {activeTab === "history" && <History />}
        {activeTab === "menu" && <MenuEditor />}
      </main>
    </div>
  );
};

export default App;
