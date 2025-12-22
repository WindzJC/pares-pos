import { useMemo, useState } from "react";
import {
  getMenu,
  resetMenu,
  saveMenu,
  type Category,
  type Item,
  type Menu
} from "../lib/storage";
import { formatPeso } from "../lib/money";

type ItemDraft = {
  id: string | null;
  name: string;
  price: string;
  categoryId: string;
  active: boolean;
};

const emptyDraft = (categoryId: string): ItemDraft => ({
  id: null,
  name: "",
  price: "",
  categoryId,
  active: true
});

const MenuEditor = () => {
  const [menu, setMenu] = useState<Menu>(() => getMenu());
  const [newCategoryName, setNewCategoryName] = useState("");
  const [itemDraft, setItemDraft] = useState<ItemDraft>(() =>
    emptyDraft(menu.categories[0]?.id ?? "")
  );

  const categoriesById = useMemo(() => {
    return new Map(menu.categories.map((category) => [category.id, category.name]));
  }, [menu.categories]);

  const updateMenu = (next: Menu) => {
    setMenu(next);
    saveMenu(next);
  };

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      return;
    }
    const nextCategory: Category = { id: crypto.randomUUID(), name };
    const nextMenu = {
      ...menu,
      categories: [...menu.categories, nextCategory]
    };
    updateMenu(nextMenu);
    setNewCategoryName("");
    if (!itemDraft.categoryId) {
      setItemDraft((prev) => ({ ...prev, categoryId: nextCategory.id }));
    }
  };

  const renameCategory = (category: Category) => {
    const name = window.prompt("Rename category", category.name)?.trim();
    if (!name) {
      return;
    }
    const nextMenu = {
      ...menu,
      categories: menu.categories.map((cat) =>
        cat.id === category.id ? { ...cat, name } : cat
      )
    };
    updateMenu(nextMenu);
  };

  const deleteCategory = (category: Category) => {
    if (!window.confirm(`Delete ${category.name}? Items will be removed.`)) {
      return;
    }
    const nextCategories = menu.categories.filter((cat) => cat.id !== category.id);
    const nextItems = menu.items.filter((item) => item.categoryId !== category.id);
    const nextMenu = { categories: nextCategories, items: nextItems };
    updateMenu(nextMenu);
    if (itemDraft.categoryId === category.id) {
      setItemDraft(emptyDraft(nextCategories[0]?.id ?? ""));
    }
  };

  const startEditItem = (item: Item) => {
    setItemDraft({
      id: item.id,
      name: item.name,
      price: item.price.toString(),
      categoryId: item.categoryId,
      active: item.active
    });
  };

  const resetDraft = () => {
    setItemDraft(emptyDraft(menu.categories[0]?.id ?? ""));
  };

  const saveItem = () => {
    const name = itemDraft.name.trim();
    const priceValue = Number(itemDraft.price);
    if (!name || !itemDraft.categoryId || !Number.isFinite(priceValue)) {
      return;
    }

    if (itemDraft.id) {
      const nextItems = menu.items.map((item) =>
        item.id === itemDraft.id
          ? {
              ...item,
              name,
              price: priceValue,
              categoryId: itemDraft.categoryId,
              active: itemDraft.active
            }
          : item
      );
      updateMenu({ ...menu, items: nextItems });
    } else {
      const nextItem: Item = {
        id: crypto.randomUUID(),
        name,
        price: priceValue,
        categoryId: itemDraft.categoryId,
        active: itemDraft.active
      };
      updateMenu({ ...menu, items: [...menu.items, nextItem] });
    }

    resetDraft();
  };

  const deleteItem = (item: Item) => {
    if (!window.confirm(`Delete ${item.name}?`)) {
      return;
    }
    updateMenu({ ...menu, items: menu.items.filter((entry) => entry.id !== item.id) });
  };

  const toggleItem = (item: Item) => {
    updateMenu({
      ...menu,
      items: menu.items.map((entry) =>
        entry.id === item.id ? { ...entry, active: !entry.active } : entry
      )
    });
  };

  const resetToDefault = () => {
    if (!window.confirm("Reset menu to default? This replaces all changes.")) {
      return;
    }
    const nextMenu = resetMenu();
    setMenu(nextMenu);
    setItemDraft(emptyDraft(nextMenu.categories[0]?.id ?? ""));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">Menu Editor</p>
            <h2 className="text-xl font-semibold">Categories</h2>
          </div>
          <button
            type="button"
            onClick={resetToDefault}
            className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            Reset to Default Menu
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {menu.categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              <span>{category.name}</span>
              <button
                type="button"
                onClick={() => renameCategory(category)}
                className="rounded-full border border-slate-200 px-2 py-1 text-xs"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => deleteCategory(category)}
                className="rounded-full border border-rose-200 px-2 py-1 text-xs text-rose-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="New category"
            className="w-full max-w-xs rounded-full border border-slate-200 px-4 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCategory}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Add Category
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-500">Menu Editor</p>
          <h2 className="text-xl font-semibold">Items</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <input
            type="text"
            value={itemDraft.name}
            onChange={(event) => setItemDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Item name"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={itemDraft.price}
            onChange={(event) => setItemDraft((prev) => ({ ...prev, price: event.target.value }))}
            placeholder="Price"
            min="0"
            step="0.01"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={itemDraft.categoryId}
            onChange={(event) =>
              setItemDraft((prev) => ({ ...prev, categoryId: event.target.value }))
            }
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Choose category
            </option>
            {menu.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={itemDraft.active}
              onChange={(event) =>
                setItemDraft((prev) => ({ ...prev, active: event.target.checked }))
              }
            />
            Active
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveItem}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {itemDraft.id ? "Update" : "Add"}
            </button>
            {itemDraft.id && (
              <button
                type="button"
                onClick={resetDraft}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {menu.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              No items yet.
            </div>
          ) : (
            menu.items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 rounded-xl border border-slate-200 p-3 text-sm sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-center"
              >
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-slate-500">{categoriesById.get(item.categoryId)}</p>
                </div>
                <div className="font-semibold">{formatPeso(item.price)}</div>
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    item.active
                      ? "border-emerald-200 text-emerald-600"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  {item.active ? "Active" : "Inactive"}
                </button>
                <button
                  type="button"
                  onClick={() => startEditItem(item)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(item)}
                  className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default MenuEditor;
