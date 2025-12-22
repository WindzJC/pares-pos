const MENU_KEY = "pos_menu";
const SALES_KEY = "pos_sales";

const state = {
  menu: null,
  sales: [],
  selectedCategoryId: "",
  cartLines: [],
  cashReceivedInput: "",
  notes: "",
  selectedSaleId: null,
  editingSale: null,
  itemDraft: {
    id: null,
    name: "",
    price: "",
    categoryId: "",
    active: true
  }
};

const elements = {};

const toCents = (amount) => Math.round(amount * 100);
const fromCents = (cents) => Math.round(cents) / 100;
const addMoney = (...amounts) =>
  fromCents(amounts.reduce((sum, amount) => sum + toCents(amount), 0));
const calcLineTotal = (price, qty) => fromCents(toCents(price) * qty);
const calcSubtotal = (lines) =>
  lines.reduce((sum, line) => addMoney(sum, calcLineTotal(line.price, line.qty)), 0);
const calcChange = (totalDue, cashReceived) =>
  cashReceived < totalDue ? 0 : fromCents(toCents(cashReceived) - toCents(totalDue));

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2
});

const formatPeso = (amount) => pesoFormatter.format(amount);

const clearNode = (node) => {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

const buildDefaultMenu = () => {
  const categories = [
    { id: crypto.randomUUID(), name: "ALA CARTE" },
    { id: crypto.randomUUID(), name: "SIZZLERS" },
    { id: crypto.randomUUID(), name: "CLASSIC CUTLETS" },
    { id: crypto.randomUUID(), name: "RICE TOPPINGS" },
    { id: crypto.randomUUID(), name: "SOUP AND STEWS" },
    { id: crypto.randomUUID(), name: "APPETIZERS" },
    { id: crypto.randomUUID(), name: "DRINKS & EXTRAS" }
  ];

  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const items = [];

  const addItem = (categoryName, name, price) => {
    const categoryId = categoryIdByName.get(categoryName);
    if (!categoryId) {
      return;
    }
    items.push({
      id: crypto.randomUUID(),
      categoryId,
      name,
      price,
      active: true
    });
  };

  const addGroup = (categoryName, price, names) => {
    names.forEach((name) => addItem(categoryName, name, price));
  };

  addGroup("ALA CARTE", 189, [
    "Korean Spicy Chicken",
    "Korean Spicy Pork",
    "Beef Bulgogi",
    "Teokbokki (Rice cake)",
    "Spicy Cheesy Chicken",
    "Bam-E",
    "Pork Binagoongan"
  ]);

  addGroup("SIZZLERS", 149, [
    "Pork Sisig",
    "Chicken Sisig",
    "Squid Sisig",
    "Korean Spicy Pork",
    "Porkchop",
    "Pork Liempo",
    "Pork steak",
    "Beef Steak",
    "Burger Steak",
    "Fried Chicken",
    "Beef Ala Pobre",
    "Fish Fillet",
    "Squid rings"
  ]);

  addGroup("CLASSIC CUTLETS", 159, [
    "Fish Cutlet",
    "Pork Cutlet",
    "Chicken Cutlet",
    "Beef Cutlet"
  ]);

  addGroup("RICE TOPPINGS", 99, ["Fish Fillet", "Porkchop", "Siomai", "Sisig", "Chicken Nuggets"]);

  addGroup("SOUP AND STEWS", 149, ["Beef Pares", "Beef Mami", "Pork Ramen"]);

  addGroup("APPETIZERS", 149, ["Egg roll", "Kimbap", "Steam Egg", "Black Noodles"]);

  addItem("DRINKS & EXTRAS", "Mt Dew", 25);
  addItem("DRINKS & EXTRAS", "Pepsi", 20);
  addItem("DRINKS & EXTRAS", "Bottled Water", 20);
  addItem("DRINKS & EXTRAS", "Plain Rice", 20);
  addItem("DRINKS & EXTRAS", "Garlic Rice", 25);
  addItem("DRINKS & EXTRAS", "Egg", 20);

  return { categories, items };
};

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const loadMenu = () => {
  const menu = readJSON(MENU_KEY, null);
  if (!menu) {
    const seed = buildDefaultMenu();
    writeJSON(MENU_KEY, seed);
    return seed;
  }
  return menu;
};

const saveMenu = (menu) => {
  writeJSON(MENU_KEY, menu);
};

const resetMenu = () => {
  const seed = buildDefaultMenu();
  writeJSON(MENU_KEY, seed);
  return seed;
};

const loadSales = () => readJSON(SALES_KEY, []);

const saveSales = (sales) => {
  writeJSON(SALES_KEY, sales);
};

const addSale = (sale) => {
  const sales = loadSales();
  sales.push(sale);
  saveSales(sales);
  state.sales = sales;
};

const updateSale = (updatedSale) => {
  const sales = loadSales();
  const nextSales = sales.map((sale) => (sale.id === updatedSale.id ? updatedSale : sale));
  saveSales(nextSales);
  state.sales = nextSales;
};

const deleteSale = (saleId) => {
  const sales = loadSales();
  const nextSales = sales.filter((sale) => sale.id !== saleId);
  saveSales(nextSales);
  state.sales = nextSales;
};

const getTodaySales = () => {
  const today = new Date();
  return state.sales.filter((sale) => {
    const date = new Date(sale.paidAt);
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  });
};

const setActiveTab = (tabId) => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${tabId}`);
  });
};

const renderCategories = () => {
  const container = elements.categoryTabs;
  clearNode(container);

  if (state.menu.categories.length === 0) {
    container.appendChild(el("div", "placeholder", "Add a category to start."));
    return;
  }

  state.menu.categories.forEach((category) => {
    const button = el("button", "chip", category.name);
    if (category.id === state.selectedCategoryId) {
      button.classList.add("active");
    }
    button.type = "button";
    button.addEventListener("click", () => {
      state.selectedCategoryId = category.id;
      renderCategories();
      renderMenuItems();
    });
    container.appendChild(button);
  });
};

const renderMenuItems = () => {
  const container = elements.menuItems;
  clearNode(container);

  if (!state.selectedCategoryId) {
    container.appendChild(el("div", "placeholder", "Pick a category."));
    return;
  }

  const items = state.menu.items.filter(
    (item) => item.active && item.categoryId === state.selectedCategoryId
  );

  if (items.length === 0) {
    container.appendChild(el("div", "placeholder", "No active items here."));
    return;
  }

  items.forEach((item) => {
    const button = el("button", "item-card");
    button.type = "button";
    const name = el("span", "", item.name);
    const price = el("small", "", formatPeso(item.price));
    button.appendChild(name);
    button.appendChild(price);
    button.addEventListener("click", () => addItemToCart(item));
    container.appendChild(button);
  });
};

const addItemToCart = (item) => {
  const existing = state.cartLines.find((line) => line.itemId === item.id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cartLines.push({
      itemId: item.id,
      name: item.name,
      price: item.price,
      qty: 1
    });
  }
  renderCart();
};

const updateCartQty = (itemId, delta) => {
  state.cartLines = state.cartLines
    .map((line) => (line.itemId === itemId ? { ...line, qty: line.qty + delta } : line))
    .filter((line) => line.qty > 0);
  renderCart();
};

const removeCartLine = (itemId) => {
  state.cartLines = state.cartLines.filter((line) => line.itemId !== itemId);
  renderCart();
};

const clearCart = () => {
  if (state.cartLines.length === 0) {
    return;
  }
  if (window.confirm("Clear the cart?")) {
    state.cartLines = [];
    state.cashReceivedInput = "";
    state.notes = "";
    elements.orderNotes.value = "";
    elements.cashReceived.value = "";
    renderCart();
  }
};

const completeSale = () => {
  if (state.cartLines.length === 0) {
    return;
  }
  const subtotal = calcSubtotal(state.cartLines);
  const totalDue = subtotal;
  const cashReceived = Number(state.cashReceivedInput || 0);
  if (cashReceived < totalDue) {
    return;
  }

  const sale = {
    id: crypto.randomUUID(),
    paidAt: new Date().toISOString(),
    lines: state.cartLines.map((line) => ({ ...line })),
    subtotal,
    totalDue,
    cashReceived,
    change: calcChange(totalDue, cashReceived)
  };

  addSale(sale);

  state.cartLines = [];
  state.cashReceivedInput = "";
  state.notes = "";
  elements.orderNotes.value = "";
  elements.cashReceived.value = "";
  renderCart();
  renderHistory();
};

const renderCart = () => {
  const container = elements.cartLines;
  clearNode(container);

  if (state.cartLines.length === 0) {
    container.appendChild(el("div", "placeholder", "Tap items to start an order."));
  } else {
    state.cartLines.forEach((line) => {
      const card = el("div", "card");
      const header = el("div", "row");
      const name = el("strong", "", line.name);
      const remove = el("button", "btn btn-outline", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => removeCartLine(line.itemId));
      header.appendChild(name);
      header.appendChild(remove);

      const price = el("div", "row");
      price.appendChild(el("span", "", formatPeso(line.price)));
      price.appendChild(el("span", "", formatPeso(calcLineTotal(line.price, line.qty))));

      const qtyControls = el("div", "qty-controls");
      const minus = el("button", "qty-btn", "-");
      minus.type = "button";
      minus.addEventListener("click", () => updateCartQty(line.itemId, -1));
      const qty = el("span", "", String(line.qty));
      const plus = el("button", "qty-btn", "+");
      plus.type = "button";
      plus.addEventListener("click", () => updateCartQty(line.itemId, 1));
      qtyControls.appendChild(minus);
      qtyControls.appendChild(qty);
      qtyControls.appendChild(plus);

      card.appendChild(header);
      card.appendChild(price);
      card.appendChild(qtyControls);
      container.appendChild(card);
    });
  }

  const subtotal = calcSubtotal(state.cartLines);
  const totalDue = subtotal;
  const cashReceived = Number(state.cashReceivedInput || 0);
  const change = calcChange(totalDue, cashReceived);

  elements.subtotalValue.textContent = formatPeso(subtotal);
  elements.totalDueValue.textContent = formatPeso(totalDue);
  elements.changeValue.textContent = formatPeso(change);

  const canComplete = state.cartLines.length > 0 && cashReceived >= totalDue && totalDue > 0;
  elements.completeSale.disabled = !canComplete;
};

const renderHistory = () => {
  const todaySales = getTodaySales();
  const grossTotal = todaySales.reduce((sum, sale) => addMoney(sum, sale.totalDue), 0);

  elements.todayCount.textContent = String(todaySales.length);
  elements.todayGross.textContent = formatPeso(grossTotal);

  clearNode(elements.salesList);

  if (todaySales.length === 0) {
    elements.salesList.appendChild(el("div", "placeholder", "No sales yet today."));
  } else {
    todaySales.forEach((sale) => {
      const button = el("button", "card", "");
      button.type = "button";
      const row = el("div", "row");
      const time = new Date(sale.paidAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
      row.appendChild(el("span", "", time));
      row.appendChild(el("strong", "", formatPeso(sale.totalDue)));
      button.appendChild(row);

      if (state.selectedSaleId === sale.id) {
        button.classList.add("active");
        button.style.borderColor = "#0f172a";
      }

      button.addEventListener("click", () => handleSelectSale(sale.id));
      elements.salesList.appendChild(button);
    });
  }

  renderSaleDetails(todaySales);
};

const handleSelectSale = (saleId) => {
  if (state.editingSale && saleId !== state.selectedSaleId) {
    if (!window.confirm("Discard changes to the current sale?")) {
      return;
    }
    state.editingSale = null;
  }
  state.selectedSaleId = saleId;
  renderHistory();
};

const startEditSale = (sale) => {
  state.editingSale = {
    id: sale.id,
    lines: sale.lines.map((line) => ({ ...line })),
    cashReceived: sale.cashReceived.toString()
  };
  renderHistory();
};

const cancelEditSale = () => {
  state.editingSale = null;
  renderHistory();
};

const updateDraftQty = (itemId, delta) => {
  if (!state.editingSale) {
    return;
  }
  state.editingSale.lines = state.editingSale.lines
    .map((line) => (line.itemId === itemId ? { ...line, qty: line.qty + delta } : line))
    .filter((line) => line.qty > 0);
  renderHistory();
};

const removeDraftLine = (itemId) => {
  if (!state.editingSale) {
    return;
  }
  state.editingSale.lines = state.editingSale.lines.filter((line) => line.itemId !== itemId);
  renderHistory();
};

const saveSaleChanges = (sale) => {
  if (!state.editingSale) {
    return;
  }
  if (state.editingSale.lines.length === 0) {
    window.alert("Sale has no items. Use Delete Sale instead.");
    return;
  }
  const subtotal = calcSubtotal(state.editingSale.lines);
  const totalDue = subtotal;
  const cashReceived = Number(state.editingSale.cashReceived || 0);
  const change = calcChange(totalDue, cashReceived);

  const updatedSale = {
    ...sale,
    lines: state.editingSale.lines,
    subtotal,
    totalDue,
    cashReceived,
    change
  };

  updateSale(updatedSale);
  state.editingSale = null;
  renderHistory();
};

const removeSale = (sale) => {
  if (!window.confirm("Delete this sale? This cannot be undone.")) {
    return;
  }
  deleteSale(sale.id);
  state.selectedSaleId = null;
  state.editingSale = null;
  renderHistory();
};

const renderSaleDetails = (todaySales) => {
  clearNode(elements.saleActions);
  clearNode(elements.saleDetails);

  const selectedSale = todaySales.find((sale) => sale.id === state.selectedSaleId) || null;

  if (!selectedSale) {
    elements.saleDetails.appendChild(el("div", "placeholder", "Select a sale to view details."));
    return;
  }

  if (state.editingSale && state.editingSale.id === selectedSale.id) {
    const saveButton = el("button", "btn btn-primary", "Save Changes");
    saveButton.type = "button";
    saveButton.addEventListener("click", () => saveSaleChanges(selectedSale));

    const cancelButton = el("button", "btn btn-outline", "Cancel");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", cancelEditSale);

    elements.saleActions.appendChild(saveButton);
    elements.saleActions.appendChild(cancelButton);
  } else {
    const editButton = el("button", "btn btn-outline", "Edit Sale");
    editButton.type = "button";
    editButton.addEventListener("click", () => startEditSale(selectedSale));

    const deleteButton = el("button", "btn btn-danger", "Delete Sale");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => removeSale(selectedSale));

    elements.saleActions.appendChild(editButton);
    elements.saleActions.appendChild(deleteButton);
  }

  const infoCard = el("div", "card");
  const timeRow = el("div", "row");
  timeRow.appendChild(el("span", "", "Paid At"));
  timeRow.appendChild(
    el(
      "span",
      "",
      new Date(selectedSale.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    )
  );
  const totalRow = el("div", "row");
  totalRow.appendChild(el("span", "", "Total"));
  const totalValue = state.editingSale && state.editingSale.id === selectedSale.id
    ? calcSubtotal(state.editingSale.lines)
    : selectedSale.totalDue;
  totalRow.appendChild(el("strong", "", formatPeso(totalValue)));
  infoCard.appendChild(timeRow);
  infoCard.appendChild(totalRow);
  elements.saleDetails.appendChild(infoCard);

  const lines = state.editingSale && state.editingSale.id === selectedSale.id
    ? state.editingSale.lines
    : selectedSale.lines;

  if (lines.length === 0) {
    elements.saleDetails.appendChild(el("div", "placeholder", "No items in this sale."));
  } else {
    lines.forEach((line) => {
      const card = el("div", "card");
      const header = el("div", "row");
      const name = el("strong", "", line.name);
      const total = el("span", "", formatPeso(calcLineTotal(line.price, line.qty)));
      header.appendChild(name);
      header.appendChild(total);
      card.appendChild(header);

      if (state.editingSale && state.editingSale.id === selectedSale.id) {
        const controls = el("div", "row");
        const qtyControls = el("div", "qty-controls");
        const minus = el("button", "qty-btn", "-");
        minus.type = "button";
        minus.addEventListener("click", () => updateDraftQty(line.itemId, -1));
        const qty = el("span", "", String(line.qty));
        const plus = el("button", "qty-btn", "+");
        plus.type = "button";
        plus.addEventListener("click", () => updateDraftQty(line.itemId, 1));
        qtyControls.appendChild(minus);
        qtyControls.appendChild(qty);
        qtyControls.appendChild(plus);
        const removeButton = el("button", "btn btn-danger", "Remove");
        removeButton.type = "button";
        removeButton.addEventListener("click", () => removeDraftLine(line.itemId));
        controls.appendChild(qtyControls);
        controls.appendChild(removeButton);
        card.appendChild(controls);
      } else {
        card.appendChild(el("div", "", `${line.qty} × ${formatPeso(line.price)}`));
      }

      elements.saleDetails.appendChild(card);
    });
  }

  const cashCard = el("div", "card");
  const cashRow = el("div", "row");
  cashRow.appendChild(el("span", "", "Cash Received"));
  if (state.editingSale && state.editingSale.id === selectedSale.id) {
    const input = el("input", "", "");
    input.type = "number";
    input.min = "0";
    input.step = "0.01";
    input.value = state.editingSale.cashReceived;
    input.addEventListener("input", (event) => {
      state.editingSale.cashReceived = event.target.value;
      renderHistory();
    });
    cashRow.appendChild(input);
  } else {
    cashRow.appendChild(el("strong", "", formatPeso(selectedSale.cashReceived)));
  }
  cashCard.appendChild(cashRow);

  const changeRow = el("div", "row");
  changeRow.appendChild(el("span", "", "Change"));
  const cashValue = state.editingSale && state.editingSale.id === selectedSale.id
    ? Number(state.editingSale.cashReceived || 0)
    : selectedSale.cashReceived;
  const changeValue = state.editingSale && state.editingSale.id === selectedSale.id
    ? calcChange(calcSubtotal(state.editingSale.lines), cashValue)
    : selectedSale.change;
  changeRow.appendChild(el("strong", "", formatPeso(changeValue)));
  cashCard.appendChild(changeRow);

  elements.saleDetails.appendChild(cashCard);
};

const renderCategoriesEditor = () => {
  const container = elements.categoryList;
  clearNode(container);

  if (state.menu.categories.length === 0) {
    container.appendChild(el("div", "placeholder", "Add a category to start."));
    return;
  }

  state.menu.categories.forEach((category) => {
    const chip = el("div", "chip", category.name);
    const rename = el("button", "btn btn-outline", "Rename");
    rename.type = "button";
    rename.addEventListener("click", () => renameCategory(category));
    const remove = el("button", "btn btn-danger", "Delete");
    remove.type = "button";
    remove.addEventListener("click", () => deleteCategory(category));
    chip.appendChild(rename);
    chip.appendChild(remove);
    container.appendChild(chip);
  });
};

const resetItemDraft = () => {
  state.itemDraft = {
    id: null,
    name: "",
    price: "",
    categoryId: state.menu.categories[0]?.id || "",
    active: true
  };
  renderItemForm();
};

const renderItemForm = () => {
  elements.itemName.value = state.itemDraft.name;
  elements.itemPrice.value = state.itemDraft.price;
  elements.itemActive.checked = state.itemDraft.active;
  elements.saveItem.textContent = state.itemDraft.id ? "Update" : "Add";

  clearNode(elements.itemCategory);
  if (state.menu.categories.length === 0) {
    const option = el("option", "", "Add category first");
    option.value = "";
    elements.itemCategory.appendChild(option);
    elements.itemCategory.value = "";
    return;
  }

  state.menu.categories.forEach((category) => {
    const option = el("option", "", category.name);
    option.value = category.id;
    elements.itemCategory.appendChild(option);
  });

  if (!state.menu.categories.find((category) => category.id === state.itemDraft.categoryId)) {
    state.itemDraft.categoryId = state.menu.categories[0].id;
  }
  elements.itemCategory.value = state.itemDraft.categoryId;
};

const renderItemsList = () => {
  clearNode(elements.itemsList);

  if (state.menu.items.length === 0) {
    elements.itemsList.appendChild(el("div", "placeholder", "No items yet."));
    return;
  }

  const categoriesById = new Map(state.menu.categories.map((category) => [category.id, category.name]));

  state.menu.items.forEach((item) => {
    const card = el("div", "card");
    const header = el("div", "row");
    header.appendChild(el("strong", "", item.name));
    header.appendChild(el("span", "", formatPeso(item.price)));
    card.appendChild(header);
    card.appendChild(el("div", "", categoriesById.get(item.categoryId) || ""));

    const actions = el("div", "inline-form");
    const toggle = el("button", "btn btn-outline", item.active ? "Active" : "Inactive");
    toggle.type = "button";
    toggle.addEventListener("click", () => toggleItem(item));
    const edit = el("button", "btn btn-outline", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => startEditItem(item));
    const remove = el("button", "btn btn-danger", "Delete");
    remove.type = "button";
    remove.addEventListener("click", () => deleteItem(item));
    actions.appendChild(toggle);
    actions.appendChild(edit);
    actions.appendChild(remove);

    card.appendChild(actions);
    elements.itemsList.appendChild(card);
  });
};

const addCategory = () => {
  const name = elements.newCategoryName.value.trim();
  if (!name) {
    return;
  }
  state.menu.categories.push({ id: crypto.randomUUID(), name });
  saveMenu(state.menu);
  elements.newCategoryName.value = "";
  if (!state.selectedCategoryId) {
    state.selectedCategoryId = state.menu.categories[0].id;
  }
  renderAll();
};

const renameCategory = (category) => {
  const name = window.prompt("Rename category", category.name);
  if (!name || !name.trim()) {
    return;
  }
  category.name = name.trim();
  saveMenu(state.menu);
  renderAll();
};

const deleteCategory = (category) => {
  if (!window.confirm(`Delete ${category.name}? Items will be removed.`)) {
    return;
  }
  state.menu.categories = state.menu.categories.filter((cat) => cat.id !== category.id);
  state.menu.items = state.menu.items.filter((item) => item.categoryId !== category.id);
  saveMenu(state.menu);
  state.selectedCategoryId = state.menu.categories[0]?.id || "";
  resetItemDraft();
  renderAll();
};

const startEditItem = (item) => {
  state.itemDraft = {
    id: item.id,
    name: item.name,
    price: item.price.toString(),
    categoryId: item.categoryId,
    active: item.active
  };
  renderItemForm();
};

const saveItem = () => {
  const name = elements.itemName.value.trim();
  const priceValue = Number(elements.itemPrice.value);
  const categoryId = elements.itemCategory.value;
  const active = elements.itemActive.checked;

  if (!name || !categoryId || !Number.isFinite(priceValue)) {
    window.alert("Fill in item name, price, and category.");
    return;
  }

  if (state.itemDraft.id) {
    state.menu.items = state.menu.items.map((item) =>
      item.id === state.itemDraft.id
        ? { ...item, name, price: priceValue, categoryId, active }
        : item
    );
  } else {
    state.menu.items.push({
      id: crypto.randomUUID(),
      name,
      price: priceValue,
      categoryId,
      active
    });
  }

  saveMenu(state.menu);
  resetItemDraft();
  renderAll();
};

const deleteItem = (item) => {
  if (!window.confirm(`Delete ${item.name}?`)) {
    return;
  }
  state.menu.items = state.menu.items.filter((entry) => entry.id !== item.id);
  saveMenu(state.menu);
  renderAll();
};

const toggleItem = (item) => {
  item.active = !item.active;
  saveMenu(state.menu);
  renderAll();
};

const resetMenuData = () => {
  if (!window.confirm("Reset menu to default? This replaces all changes.")) {
    return;
  }
  state.menu = resetMenu();
  state.selectedCategoryId = state.menu.categories[0]?.id || "";
  resetItemDraft();
  renderAll();
};

const renderMenuEditor = () => {
  renderCategoriesEditor();
  renderItemForm();
  renderItemsList();
};

const renderAll = () => {
  renderCategories();
  renderMenuItems();
  renderCart();
  renderHistory();
  renderMenuEditor();
};

const wireEvents = () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  elements.clearCart.addEventListener("click", clearCart);
  elements.cashReceived.addEventListener("input", (event) => {
    state.cashReceivedInput = event.target.value;
    renderCart();
  });
  elements.orderNotes.addEventListener("input", (event) => {
    state.notes = event.target.value;
  });
  elements.completeSale.addEventListener("click", completeSale);

  elements.exportCsv.addEventListener("click", exportCsv);

  elements.addCategory.addEventListener("click", addCategory);
  elements.resetMenu.addEventListener("click", resetMenuData);
  elements.saveItem.addEventListener("click", saveItem);
  elements.cancelItem.addEventListener("click", resetItemDraft);
  elements.itemCategory.addEventListener("change", (event) => {
    state.itemDraft.categoryId = event.target.value;
  });
  elements.itemActive.addEventListener("change", (event) => {
    state.itemDraft.active = event.target.checked;
  });
};

const exportCsv = () => {
  const todaySales = getTodaySales();
  if (todaySales.length === 0) {
    return;
  }

  const rows = [["Sale ID", "Time", "Item", "Qty", "Price", "Line Total", "Sale Total"]];

  todaySales.forEach((sale) => {
    const time = new Date(sale.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  const escapeCsv = (value) => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csv = rows.map((row) => row.map((value) => escapeCsv(value)).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `sales-${stamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const init = () => {
  elements.categoryTabs = document.getElementById("category-tabs");
  elements.menuItems = document.getElementById("menu-items");
  elements.cartLines = document.getElementById("cart-lines");
  elements.clearCart = document.getElementById("clear-cart");
  elements.orderNotes = document.getElementById("order-notes");
  elements.subtotalValue = document.getElementById("subtotal-value");
  elements.totalDueValue = document.getElementById("total-due-value");
  elements.cashReceived = document.getElementById("cash-received");
  elements.changeValue = document.getElementById("change-value");
  elements.completeSale = document.getElementById("complete-sale");
  elements.exportCsv = document.getElementById("export-csv");
  elements.todayCount = document.getElementById("today-count");
  elements.todayGross = document.getElementById("today-gross");
  elements.salesList = document.getElementById("sales-list");
  elements.saleDetails = document.getElementById("sale-details");
  elements.saleActions = document.getElementById("sale-actions");
  elements.categoryList = document.getElementById("category-list");
  elements.newCategoryName = document.getElementById("new-category-name");
  elements.addCategory = document.getElementById("add-category");
  elements.resetMenu = document.getElementById("reset-menu");
  elements.itemName = document.getElementById("item-name");
  elements.itemPrice = document.getElementById("item-price");
  elements.itemCategory = document.getElementById("item-category");
  elements.itemActive = document.getElementById("item-active");
  elements.saveItem = document.getElementById("save-item");
  elements.cancelItem = document.getElementById("cancel-item");
  elements.itemsList = document.getElementById("items-list");

  state.menu = loadMenu();
  state.sales = loadSales();
  state.selectedCategoryId = state.menu.categories[0]?.id || "";
  state.itemDraft.categoryId = state.menu.categories[0]?.id || "";

  wireEvents();
  renderAll();
};

document.addEventListener("DOMContentLoaded", init);
