const MENU_KEY = "pos_menu";
const SALES_KEY = "pos_sales";
const OPEN_ORDERS_KEY = "pos_open_orders";
const EXPENSES_KEY = "pos_expenses";
const SYNC_QUEUE_KEY = "pos_sync_queue";
const SYNC_STATE_KEY = "pos_sync_state";
const SYNC_CONFIG = {
  // Paste the Apps Script Web App URL here to enable sync.
  endpoint: "https://script.google.com/macros/s/AKfycbxi5Z_s8k3taRzZbB7oSlUECa3ecTQOV-SjMn5wv5wEOm6EVVruXxoTANejowEU_EaGKg/exec",
  // Optional: set the same secret in apps-script.gs for basic protection.
  secret: ""
};

const state = {
  menu: null,
  sales: [],
  openOrders: [],
  expenses: [],
  selectedCategoryId: "",
  cartLines: [],
  cashReceivedInput: "",
  customerNumber: "",
  paymentMethod: "cash",
  notes: "",
  selectedSaleId: null,
  editingSale: null,
  syncing: false,
  itemDraft: {
    id: null,
    name: "",
    price: "",
    stock: "",
    foodpandaPrice: "",
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
const getLocalDateStamp = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const getLocalTimeStamp = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2
});

const formatPeso = (amount) => pesoFormatter.format(amount);

const isAutoPaid = (method) => method !== "cash";

const getItemPrice = (item) => {
  if (
    state.paymentMethod === "foodpanda" &&
    typeof item.foodpandaPrice === "number"
  ) {
    return item.foodpandaPrice;
  }
  return item.price;
};

const tallyLines = (lines) => {
  const tally = new Map();
  lines.forEach((line) => {
    tally.set(line.itemId, (tally.get(line.itemId) || 0) + line.qty);
  });
  return tally;
};

const applyStockAdjustments = (adjustments) => {
  let changed = false;
  adjustments.forEach((delta, itemId) => {
    const item = state.menu.items.find((entry) => entry.id === itemId);
    if (!item || typeof item.stock !== "number") {
      return;
    }
    item.stock = Math.max(0, item.stock + delta);
    changed = true;
  });
  if (changed) {
    saveMenu(state.menu);
    renderMenuItems();
    renderMenuEditor();
  }
};

const normalizeHeader = (value) => String(value || "").trim().toLowerCase();

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const findOrCreateCategory = (name) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }
  const existing = state.menu.categories.find(
    (category) => category.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) {
    return existing.id;
  }
  const category = { id: crypto.randomUUID(), name: trimmed };
  state.menu.categories.push(category);
  return category.id;
};

const findItemByName = (name, categoryId) => {
  const lowered = name.toLowerCase();
  const inCategory = state.menu.items.find(
    (item) =>
      item.name.toLowerCase() === lowered &&
      (!categoryId || item.categoryId === categoryId)
  );
  if (inCategory) {
    return inCategory;
  }
  return state.menu.items.find((item) => item.name.toLowerCase() === lowered) || null;
};

const importInventoryXlsx = (file) => {
  if (!window.XLSX) {
    window.alert("XLSX library not loaded. Check your internet connection.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = window.XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    if (!rows.length) {
      window.alert("No data found in the XLSX file.");
      return;
    }

    const headers = rows[0].map(normalizeHeader);
    const columnIndex = (label) => headers.indexOf(label);
    const pickIndex = (labels) => {
      for (const label of labels) {
        const idx = columnIndex(label);
        if (idx !== -1) {
          return idx;
        }
      }
      return -1;
    };

    const itemIdx = pickIndex(["item", "item name", "product", "menu item"]);
    const categoryIdx = pickIndex(["category", "group"]);
    const priceIdx = pickIndex(["price", "dine in price", "menu price"]);
    const stockIdx = pickIndex(["stock", "inventory", "qty", "quantity"]);
    const foodpandaIdx = pickIndex([
      "foodpanda price",
      "food panda price",
      "fp price",
      "foodpanda"
    ]);

    if (itemIdx === -1) {
      window.alert("Item column not found. Make sure there is an Item header.");
      return;
    }

    let imported = 0;
    rows.slice(1).forEach((row) => {
      const name = String(row[itemIdx] || "").trim();
      if (!name) {
        return;
      }
      const categoryName = categoryIdx !== -1 ? String(row[categoryIdx] || "").trim() : "";
      const categoryId = categoryName ? findOrCreateCategory(categoryName) : "";
      const existing = findItemByName(name, categoryId);

      const priceValue = priceIdx !== -1 ? parseOptionalNumber(row[priceIdx]) : null;
      const stockValue = stockIdx !== -1 ? parseOptionalNumber(row[stockIdx]) : null;
      const foodpandaValue = foodpandaIdx !== -1 ? parseOptionalNumber(row[foodpandaIdx]) : null;

      if (existing) {
        if (categoryId) {
          existing.categoryId = categoryId;
        }
        if (typeof priceValue === "number") {
          existing.price = priceValue;
        }
        if (typeof stockValue === "number") {
          existing.stock = stockValue;
        }
        if (typeof foodpandaValue === "number") {
          existing.foodpandaPrice = foodpandaValue;
        }
      } else {
        state.menu.items.push({
          id: crypto.randomUUID(),
          name,
          price: typeof priceValue === "number" ? priceValue : 0,
          stock: typeof stockValue === "number" ? stockValue : null,
          foodpandaPrice: typeof foodpandaValue === "number" ? foodpandaValue : null,
          categoryId: categoryId || state.menu.categories[0]?.id || "",
          active: true
        });
      }
      imported += 1;
    });

    if (imported === 0) {
      window.alert("No rows were imported. Check your file format.");
      return;
    }
    saveMenu(state.menu);
    renderAll();
    window.alert(`Imported ${imported} rows from ${sheetName}.`);
  };
  reader.readAsArrayBuffer(file);
};

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
      stock: null,
      foodpandaPrice: null,
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

const loadSyncQueue = () => readJSON(SYNC_QUEUE_KEY, []);

const saveSyncQueue = (queue) => {
  writeJSON(SYNC_QUEUE_KEY, queue);
};

const loadSyncState = () => readJSON(SYNC_STATE_KEY, { inventoryQueuedDate: "" });

const saveSyncState = (stateValue) => {
  writeJSON(SYNC_STATE_KEY, stateValue);
};

const loadMenu = () => {
  const menu = readJSON(MENU_KEY, null);
  if (!menu) {
    const seed = buildDefaultMenu();
    writeJSON(MENU_KEY, seed);
    return seed;
  }
  menu.items = menu.items.map((item) => ({
    ...item,
    stock: typeof item.stock === "number" ? item.stock : null,
    foodpandaPrice: typeof item.foodpandaPrice === "number" ? item.foodpandaPrice : null
  }));
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

const loadOpenOrders = () => readJSON(OPEN_ORDERS_KEY, []);

const saveOpenOrders = (orders) => {
  writeJSON(OPEN_ORDERS_KEY, orders);
};

const loadExpenses = () => readJSON(EXPENSES_KEY, []);

const saveExpenses = (expenses) => {
  writeJSON(EXPENSES_KEY, expenses);
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

const isSyncEnabled = () => Boolean(SYNC_CONFIG.endpoint);

const buildSyncPayload = (type, data) => {
  const payload = {
    type,
    data,
    sentAt: new Date().toISOString(),
    source: "pares-pos"
  };
  if (SYNC_CONFIG.secret) {
    payload.secret = SYNC_CONFIG.secret;
  }
  return payload;
};

const flushSyncQueue = async () => {
  if (!isSyncEnabled() || state.syncing || !navigator.onLine) {
    return;
  }
  state.syncing = true;
  let queue = loadSyncQueue();
  while (queue.length > 0) {
    const payload = queue[0];
    try {
      const response = await fetch(SYNC_CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }
      queue.shift();
      saveSyncQueue(queue);
    } catch {
      break;
    }
  }
  state.syncing = false;
};

const enqueueSync = (payload) => {
  if (!isSyncEnabled()) {
    return;
  }
  const queue = loadSyncQueue();
  queue.push(payload);
  saveSyncQueue(queue);
  flushSyncQueue();
};

const queueSaleSync = (sale, mode = "sale") => {
  enqueueSync(
    buildSyncPayload("sale", {
      mode,
      sale: {
        ...sale,
        localDate: getLocalDateStamp(sale.paidAt),
        localTime: getLocalTimeStamp(sale.paidAt)
      }
    })
  );
};

const queueExpenseSync = (expense) => {
  enqueueSync(
    buildSyncPayload("expense", {
      ...expense,
      localTime: getLocalTimeStamp(expense.createdAt)
    })
  );
};

const buildInventoryReport = () => {
  if (!state.menu) {
    return { rows: [], dateStamp: getLocalDateStamp() };
  }
  const todaySales = getTodaySales();
  const categoriesById = new Map(state.menu.categories.map((category) => [category.id, category.name]));
  const report = new Map();
  const dateStamp = getLocalDateStamp();

  state.menu.items.forEach((item) => {
    report.set(item.id, {
      itemId: item.id,
      name: item.name,
      category: categoriesById.get(item.categoryId) || "",
      price: item.price,
      stock: item.stock,
      foodpandaPrice: item.foodpandaPrice,
      cashQty: 0,
      cashSales: 0,
      gcashQty: 0,
      gcashSales: 0,
      foodpandaQty: 0,
      foodpandaSales: 0
    });
  });

  todaySales.forEach((sale) => {
    const method = sale.paymentMethod ? sale.paymentMethod.toUpperCase() : "CASH";
    sale.lines.forEach((line) => {
      let entry = report.get(line.itemId);
      if (!entry) {
        entry = {
          itemId: line.itemId,
          name: line.name,
          category: "Unlisted",
          price: line.price,
          stock: null,
          foodpandaPrice: null,
          cashQty: 0,
          cashSales: 0,
          gcashQty: 0,
          gcashSales: 0,
          foodpandaQty: 0,
          foodpandaSales: 0
        };
        report.set(line.itemId, entry);
      }
      const lineTotal = calcLineTotal(line.price, line.qty);
      if (method === "GCASH") {
        entry.gcashQty += line.qty;
        entry.gcashSales += lineTotal;
      } else if (method === "FOODPANDA") {
        entry.foodpandaQty += line.qty;
        entry.foodpandaSales += lineTotal;
      } else {
        entry.cashQty += line.qty;
        entry.cashSales += lineTotal;
      }
    });
  });

  const rows = Array.from(report.values())
    .map((entry) => {
      const totalQty = entry.cashQty + entry.gcashQty + entry.foodpandaQty;
      const totalSales = entry.cashSales + entry.gcashSales + entry.foodpandaSales;
      return { ...entry, totalQty, totalSales, date: dateStamp };
    })
    .sort((a, b) => {
      const categoryCompare = a.category.localeCompare(b.category);
      if (categoryCompare !== 0) {
        return categoryCompare;
      }
      return a.name.localeCompare(b.name);
    });

  return { rows, dateStamp };
};

const maybeQueueInventorySnapshot = () => {
  if (!isSyncEnabled()) {
    return;
  }
  const syncState = loadSyncState();
  const todayStamp = getLocalDateStamp();
  if (syncState.inventoryQueuedDate === todayStamp) {
    return;
  }
  const report = buildInventoryReport();
  if (report.rows.length === 0) {
    return;
  }
  enqueueSync(
    buildSyncPayload("inventory_snapshot", {
      date: todayStamp,
      rows: report.rows
    })
  );
  saveSyncState({ ...syncState, inventoryQueuedDate: todayStamp });
};

const setActiveTab = (tabId) => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${tabId}`);
  });
  if (tabId === "inventory") {
    maybeQueueInventorySnapshot();
  }
  if (tabId === "expenses") {
    renderExpenses();
  }
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
    const price = el("small", "", formatPeso(getItemPrice(item)));
    button.appendChild(name);
    button.appendChild(price);

    if (typeof item.stock === "number") {
      const stockText = item.stock <= 0 ? "Sold out" : `Stock: ${item.stock}`;
      button.appendChild(el("small", "", stockText));
      if (item.stock <= 0) {
        button.disabled = true;
        button.classList.add("disabled");
      }
    }

    button.addEventListener("click", () => addItemToCart(item));
    container.appendChild(button);
  });
};

const addItemToCart = (item) => {
  if (typeof item.stock === "number") {
    const currentQty = state.cartLines.find((line) => line.itemId === item.id)?.qty ?? 0;
    if (currentQty + 1 > item.stock) {
      window.alert(`Not enough stock for ${item.name}.`);
      return;
    }
  }
  const existing = state.cartLines.find((line) => line.itemId === item.id);
  if (existing) {
    existing.qty += 1;
  } else {
    const price = getItemPrice(item);
    state.cartLines.push({
      itemId: item.id,
      name: item.name,
      price,
      qty: 1
    });
  }
  renderCart();
};

const updateCartQty = (itemId, delta) => {
  if (delta > 0) {
    const item = state.menu.items.find((entry) => entry.id === itemId);
    const line = state.cartLines.find((entry) => entry.itemId === itemId);
    if (item && typeof item.stock === "number") {
      const currentQty = line?.qty ?? 0;
      if (currentQty + delta > item.stock) {
        window.alert(`Not enough stock for ${item.name}.`);
        return;
      }
    }
  }
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
    state.customerNumber = "";
    elements.orderNotes.value = "";
    elements.cashReceived.value = "";
    elements.customerNumber.value = "";
    renderCart();
  }
};

const completeSale = () => {
  if (state.cartLines.length === 0) {
    return;
  }
  const subtotal = calcSubtotal(state.cartLines);
  const totalDue = subtotal;
  const cashReceived = isAutoPaid(state.paymentMethod)
    ? totalDue
    : Number(state.cashReceivedInput || 0);
  if (!isAutoPaid(state.paymentMethod) && cashReceived < totalDue) {
    return;
  }

  const stockIssues = state.cartLines
    .map((line) => {
      const item = state.menu.items.find((entry) => entry.id === line.itemId);
      if (!item || typeof item.stock !== "number") {
        return null;
      }
      if (line.qty > item.stock) {
        return `${item.name} (stock ${item.stock}, need ${line.qty})`;
      }
      return null;
    })
    .filter(Boolean);

  if (stockIssues.length > 0) {
    window.alert(`Not enough stock for: ${stockIssues.join(", ")}.`);
    return;
  }

  const sale = {
    id: crypto.randomUUID(),
    paidAt: new Date().toISOString(),
    customerNumber: state.customerNumber.trim(),
    paymentMethod: state.paymentMethod,
    lines: state.cartLines.map((line) => ({ ...line })),
    subtotal,
    totalDue,
    cashReceived,
    change: calcChange(totalDue, cashReceived)
  };

  addSale(sale);
  queueSaleSync(sale, "sale");
  const adjustments = new Map();
  state.cartLines.forEach((line) => {
    adjustments.set(line.itemId, (adjustments.get(line.itemId) || 0) - line.qty);
  });
  applyStockAdjustments(adjustments);

  state.cartLines = [];
  state.cashReceivedInput = "";
  state.notes = "";
  state.customerNumber = "";
  elements.orderNotes.value = "";
  elements.cashReceived.value = "";
  elements.customerNumber.value = "";
  renderCart();
  renderHistory();
};

const updatePaymentMethodUI = () => {
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.method === state.paymentMethod);
  });
};

const updateCartPricesForMethod = () => {
  state.cartLines = state.cartLines.map((line) => {
    const item = state.menu.items.find((entry) => entry.id === line.itemId);
    if (!item) {
      return line;
    }
    return { ...line, price: getItemPrice(item) };
  });
};

const holdOrder = () => {
  if (state.cartLines.length === 0) {
    return;
  }
  const order = {
    id: crypto.randomUUID(),
    customerNumber: state.customerNumber.trim(),
    notes: state.notes,
    lines: state.cartLines.map((line) => ({ ...line })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const orders = loadOpenOrders();
  orders.push(order);
  saveOpenOrders(orders);
  state.openOrders = orders;

  state.cartLines = [];
  state.cashReceivedInput = "";
  state.notes = "";
  state.customerNumber = "";
  elements.orderNotes.value = "";
  elements.cashReceived.value = "";
  elements.customerNumber.value = "";
  renderCart();
  renderOpenOrders();
};

const resumeOrder = (orderId) => {
  const order = state.openOrders.find((entry) => entry.id === orderId);
  if (!order) {
    return;
  }
  state.openOrders = state.openOrders.filter((entry) => entry.id !== orderId);
  saveOpenOrders(state.openOrders);

  state.cartLines = order.lines.map((line) => ({ ...line }));
  state.notes = order.notes || "";
  state.customerNumber = order.customerNumber || "";
  state.cashReceivedInput = "";
  state.paymentMethod = "cash";
  elements.orderNotes.value = state.notes;
  elements.customerNumber.value = state.customerNumber;
  elements.cashReceived.value = "";
  updateCartPricesForMethod();
  updatePaymentMethodUI();
  renderCart();
  renderMenuItems();
  renderOpenOrders();
};

const deleteOpenOrder = (orderId) => {
  const order = state.openOrders.find((entry) => entry.id === orderId);
  if (!order) {
    return;
  }
  if (!window.confirm("Delete this open order?")) {
    return;
  }
  state.openOrders = state.openOrders.filter((entry) => entry.id !== orderId);
  saveOpenOrders(state.openOrders);
  renderOpenOrders();
};

const renderOpenOrders = () => {
  clearNode(elements.openOrders);
  if (state.openOrders.length === 0) {
    elements.openOrders.appendChild(el("div", "placeholder", "No open orders."));
    return;
  }

  state.openOrders.forEach((order) => {
    const card = el("div", "card");
    const row = el("div", "row");
    const title = order.customerNumber ? order.customerNumber : "Walk-in";
    row.appendChild(el("strong", "", title));
    const total = calcSubtotal(order.lines);
    row.appendChild(el("span", "", formatPeso(total)));
    card.appendChild(row);

    const meta = el("div", "", "");
    const time = new Date(order.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    meta.textContent = `Saved ${time}`;
    card.appendChild(meta);

    const actions = el("div", "inline-form");
    const resumeBtn = el("button", "btn btn-primary", "Resume");
    resumeBtn.type = "button";
    resumeBtn.addEventListener("click", () => resumeOrder(order.id));
    const deleteBtn = el("button", "btn btn-danger", "Delete");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => deleteOpenOrder(order.id));
    actions.appendChild(resumeBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(actions);

    elements.openOrders.appendChild(card);
  });
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
  const cashReceived = isAutoPaid(state.paymentMethod)
    ? totalDue
    : Number(state.cashReceivedInput || 0);
  const change = calcChange(totalDue, cashReceived);

  elements.subtotalValue.textContent = formatPeso(subtotal);
  elements.totalDueValue.textContent = formatPeso(totalDue);
  elements.changeValue.textContent = formatPeso(change);

  const canComplete =
    state.cartLines.length > 0 &&
    totalDue > 0 &&
    (isAutoPaid(state.paymentMethod) || cashReceived >= totalDue);
  elements.completeSale.disabled = !canComplete;
  elements.holdOrder.disabled = state.cartLines.length === 0;
  elements.cashReceived.disabled = isAutoPaid(state.paymentMethod);
  elements.cashReceived.value =
    isAutoPaid(state.paymentMethod) && totalDue > 0
      ? totalDue.toFixed(2)
      : state.cashReceivedInput;
  updatePaymentMethodUI();
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
    cashReceived: isAutoPaid(sale.paymentMethod)
      ? sale.totalDue.toString()
      : sale.cashReceived.toString()
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
  const cashReceived = isAutoPaid(sale.paymentMethod)
    ? totalDue
    : Number(state.editingSale.cashReceived || 0);
  const change = calcChange(totalDue, cashReceived);

  const originalTally = tallyLines(sale.lines);
  const updatedTally = tallyLines(state.editingSale.lines);
  const adjustments = new Map();
  const stockIssues = [];
  new Set([...originalTally.keys(), ...updatedTally.keys()]).forEach((itemId) => {
    const originalQty = originalTally.get(itemId) || 0;
    const updatedQty = updatedTally.get(itemId) || 0;
    const delta = originalQty - updatedQty;
    if (delta !== 0) {
      const item = state.menu.items.find((entry) => entry.id === itemId);
      if (item && typeof item.stock === "number" && delta < 0) {
        const needed = Math.abs(delta);
        if (item.stock < needed) {
          stockIssues.push(`${item.name} (stock ${item.stock}, need ${needed})`);
        }
      }
      adjustments.set(itemId, delta);
    }
  });

  if (stockIssues.length > 0) {
    window.alert(`Not enough stock for: ${stockIssues.join(", ")}.`);
    return;
  }

  const updatedSale = {
    ...sale,
    lines: state.editingSale.lines,
    subtotal,
    totalDue,
    cashReceived,
    change
  };

  updateSale(updatedSale);
  applyStockAdjustments(adjustments);
  queueSaleSync(sale, "void");
  queueSaleSync(updatedSale, "sale");
  state.editingSale = null;
  renderHistory();
};

const removeSale = (sale) => {
  if (!window.confirm("Delete this sale? This cannot be undone.")) {
    return;
  }
  const adjustments = new Map();
  sale.lines.forEach((line) => {
    adjustments.set(line.itemId, (adjustments.get(line.itemId) || 0) + line.qty);
  });
  applyStockAdjustments(adjustments);
  deleteSale(sale.id);
  queueSaleSync(sale, "void");
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
  const customerRow = el("div", "row");
  customerRow.appendChild(el("span", "", "Customer"));
  customerRow.appendChild(
    el("span", "", selectedSale.customerNumber ? selectedSale.customerNumber : "Walk-in")
  );
  const paymentRow = el("div", "row");
  paymentRow.appendChild(el("span", "", "Payment"));
  paymentRow.appendChild(
    el("span", "", selectedSale.paymentMethod ? selectedSale.paymentMethod.toUpperCase() : "Cash")
  );
  const totalRow = el("div", "row");
  totalRow.appendChild(el("span", "", "Total"));
  const totalValue = state.editingSale && state.editingSale.id === selectedSale.id
    ? calcSubtotal(state.editingSale.lines)
    : selectedSale.totalDue;
  totalRow.appendChild(el("strong", "", formatPeso(totalValue)));
  infoCard.appendChild(timeRow);
  infoCard.appendChild(customerRow);
  infoCard.appendChild(paymentRow);
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
  const paymentLabel = isAutoPaid(selectedSale.paymentMethod)
    ? `${selectedSale.paymentMethod.toUpperCase()} Received`
    : "Cash Received";
  cashRow.appendChild(el("span", "", paymentLabel));
  if (state.editingSale && state.editingSale.id === selectedSale.id) {
    if (isAutoPaid(selectedSale.paymentMethod)) {
      cashRow.appendChild(el("strong", "", formatPeso(totalValue)));
    } else {
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
    }
  } else {
    cashRow.appendChild(el("strong", "", formatPeso(selectedSale.cashReceived)));
  }
  cashCard.appendChild(cashRow);

  const changeRow = el("div", "row");
  changeRow.appendChild(el("span", "", "Change"));
  const cashValue = state.editingSale && state.editingSale.id === selectedSale.id
    ? isAutoPaid(selectedSale.paymentMethod)
      ? totalValue
      : Number(state.editingSale.cashReceived || 0)
    : selectedSale.cashReceived;
  const changeValue = state.editingSale && state.editingSale.id === selectedSale.id
    ? calcChange(calcSubtotal(state.editingSale.lines), cashValue)
    : selectedSale.change;
  changeRow.appendChild(el("strong", "", formatPeso(changeValue)));
  cashCard.appendChild(changeRow);

  elements.saleDetails.appendChild(cashCard);
};

const getExpensesForDate = (dateStamp) =>
  state.expenses.filter((expense) => expense.date === dateStamp);

const addExpense = () => {
  const amountValue = Number(elements.expenseAmount.value);
  const category = elements.expenseCategory.value.trim();
  const notes = elements.expenseNotes.value.trim();
  const dateValue = elements.expenseDate?.value || getLocalDateStamp();

  if (!Number.isFinite(amountValue) || amountValue <= 0 || !category) {
    window.alert("Enter a valid amount and category.");
    return;
  }

  const expense = {
    id: crypto.randomUUID(),
    date: dateValue,
    amount: amountValue,
    category,
    notes,
    createdAt: new Date().toISOString()
  };

  state.expenses = [...state.expenses, expense];
  saveExpenses(state.expenses);
  queueExpenseSync(expense);

  elements.expenseAmount.value = "";
  elements.expenseCategory.value = "";
  elements.expenseNotes.value = "";
  renderExpenses();
};

const deleteExpense = (expenseId) => {
  const expense = state.expenses.find((entry) => entry.id === expenseId);
  if (!expense) {
    return;
  }
  if (!window.confirm("Delete this expense?")) {
    return;
  }
  state.expenses = state.expenses.filter((entry) => entry.id !== expenseId);
  saveExpenses(state.expenses);
  renderExpenses();
};

const renderExpenses = () => {
  if (!elements.expenseList) {
    return;
  }
  const dateStamp = elements.expenseDate?.value || getLocalDateStamp();
  const expenses = getExpensesForDate(dateStamp).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const total = expenses.reduce((sum, expense) => addMoney(sum, expense.amount), 0);

  elements.expenseCount.textContent = String(expenses.length);
  elements.expenseTotal.textContent = formatPeso(total);

  clearNode(elements.expenseList);

  if (expenses.length === 0) {
    elements.expenseList.appendChild(el("div", "placeholder", "No expenses yet."));
    return;
  }

  expenses.forEach((expense) => {
    const card = el("div", "card");
    const row = el("div", "row");
    row.appendChild(el("strong", "", expense.category));
    row.appendChild(el("span", "", formatPeso(expense.amount)));
    card.appendChild(row);

    const meta = el(
      "div",
      "",
      `${getLocalTimeStamp(expense.createdAt)} • ${expense.notes || "No notes"}`
    );
    card.appendChild(meta);

    const actions = el("div", "inline-form");
    const remove = el("button", "btn btn-danger", "Delete");
    remove.type = "button";
    remove.addEventListener("click", () => deleteExpense(expense.id));
    actions.appendChild(remove);
    card.appendChild(actions);

    elements.expenseList.appendChild(card);
  });
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
    stock: "",
    foodpandaPrice: "",
    categoryId: state.menu.categories[0]?.id || "",
    active: true
  };
  renderItemForm();
};

const renderItemForm = () => {
  elements.itemName.value = state.itemDraft.name;
  elements.itemPrice.value = state.itemDraft.price;
  elements.itemStock.value = state.itemDraft.stock;
  elements.itemFoodpandaPrice.value = state.itemDraft.foodpandaPrice;
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
    const stockText =
      typeof item.stock === "number" ? `Stock: ${item.stock}` : "Stock: not tracked";
    card.appendChild(el("div", "", stockText));
    const foodpandaText =
      typeof item.foodpandaPrice === "number"
        ? `Foodpanda: ${formatPeso(item.foodpandaPrice)}`
        : "Foodpanda: not set";
    card.appendChild(el("div", "", foodpandaText));

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
    stock: typeof item.stock === "number" ? item.stock.toString() : "",
    foodpandaPrice: typeof item.foodpandaPrice === "number" ? item.foodpandaPrice.toString() : "",
    categoryId: item.categoryId,
    active: item.active
  };
  renderItemForm();
};

const saveItem = () => {
  const name = elements.itemName.value.trim();
  const priceValue = Number(elements.itemPrice.value);
  const stockRaw = elements.itemStock.value;
  const stockValue =
    stockRaw === "" ? null : Number.isFinite(Number(stockRaw)) ? Number(stockRaw) : NaN;
  const foodpandaRaw = elements.itemFoodpandaPrice.value;
  const foodpandaValue =
    foodpandaRaw === ""
      ? null
      : Number.isFinite(Number(foodpandaRaw))
        ? Number(foodpandaRaw)
        : NaN;
  const categoryId = elements.itemCategory.value;
  const active = elements.itemActive.checked;

  if (
    !name ||
    !categoryId ||
    !Number.isFinite(priceValue) ||
    Number.isNaN(stockValue) ||
    Number.isNaN(foodpandaValue) ||
    (typeof stockValue === "number" && stockValue < 0) ||
    (typeof foodpandaValue === "number" && foodpandaValue < 0)
  ) {
    window.alert(
      "Fill in item name, price, category, and valid stock/foodpanda price (or leave blank)."
    );
    return;
  }

  if (state.itemDraft.id) {
    state.menu.items = state.menu.items.map((item) =>
      item.id === state.itemDraft.id
        ? {
            ...item,
            name,
            price: priceValue,
            stock: stockValue,
            foodpandaPrice: foodpandaValue,
            categoryId,
            active
          }
        : item
    );
  } else {
    state.menu.items.push({
      id: crypto.randomUUID(),
      name,
      price: priceValue,
      stock: stockValue,
      foodpandaPrice: foodpandaValue,
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

const renderInventory = () => {
  if (!elements.inventoryBody) {
    return;
  }
  clearNode(elements.inventoryBody);
  const report = buildInventoryReport();
  if (elements.inventoryDate) {
    elements.inventoryDate.textContent = report.dateStamp;
  }

  report.rows.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.appendChild(el("td", "", entry.category));
    tr.appendChild(el("td", "", entry.name));
    tr.appendChild(el("td", "", formatPeso(entry.price)));

    const stockCell = document.createElement("td");
    if (state.menu.items.find((item) => item.id === entry.itemId)) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.value = typeof entry.stock === "number" ? String(entry.stock) : "";
      input.placeholder = "—";
      input.dataset.stock = "true";
      input.dataset.itemId = entry.itemId;
      stockCell.appendChild(input);
    } else {
      stockCell.textContent = "—";
    }
    tr.appendChild(stockCell);

    tr.appendChild(
      el(
        "td",
        "",
        typeof entry.foodpandaPrice === "number" ? formatPeso(entry.foodpandaPrice) : "—"
      )
    );
    tr.appendChild(el("td", "", String(entry.cashQty)));
    tr.appendChild(el("td", "", entry.cashSales ? formatPeso(entry.cashSales) : "0"));
    tr.appendChild(el("td", "", String(entry.gcashQty)));
    tr.appendChild(el("td", "", entry.gcashSales ? formatPeso(entry.gcashSales) : "0"));
    tr.appendChild(el("td", "", String(entry.foodpandaQty)));
    tr.appendChild(
      el("td", "", entry.foodpandaSales ? formatPeso(entry.foodpandaSales) : "0")
    );
    tr.appendChild(el("td", "", String(entry.totalQty)));
    tr.appendChild(el("td", "", entry.totalSales ? formatPeso(entry.totalSales) : "0"));
    tr.appendChild(el("td", "", entry.date));
    elements.inventoryBody.appendChild(tr);
  });
};

const renderAll = () => {
  renderCategories();
  renderMenuItems();
  renderCart();
  renderOpenOrders();
  renderHistory();
  renderMenuEditor();
  renderInventory();
  renderExpenses();
};

const wireEvents = () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.paymentMethod = btn.dataset.method;
      if (isAutoPaid(state.paymentMethod)) {
        state.cashReceivedInput = "";
      }
      updateCartPricesForMethod();
      renderCart();
      renderMenuItems();
    });
  });

  elements.clearCart.addEventListener("click", clearCart);
  elements.cashReceived.addEventListener("input", (event) => {
    if (state.paymentMethod === "cash") {
      state.cashReceivedInput = event.target.value;
    }
    renderCart();
  });
  elements.customerNumber.addEventListener("input", (event) => {
    state.customerNumber = event.target.value;
  });
  elements.orderNotes.addEventListener("input", (event) => {
    state.notes = event.target.value;
  });
  elements.completeSale.addEventListener("click", completeSale);
  elements.holdOrder.addEventListener("click", holdOrder);

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

  if (elements.inventoryBody) {
    elements.inventoryBody.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (!target.dataset.stock || !target.dataset.itemId) {
        return;
      }
      const item = state.menu.items.find((entry) => entry.id === target.dataset.itemId);
      if (!item) {
        return;
      }
      const value = target.value.trim();
      if (value === "") {
        item.stock = null;
      } else {
        const nextStock = Number(value);
        if (!Number.isFinite(nextStock) || nextStock < 0) {
          window.alert("Stock must be a non-negative number.");
          target.value = typeof item.stock === "number" ? String(item.stock) : "";
          return;
        }
        item.stock = nextStock;
      }
      saveMenu(state.menu);
      renderMenuItems();
      renderMenuEditor();
      renderInventory();
    });
  }

  if (elements.inventoryFile && elements.importInventory) {
    elements.importInventory.addEventListener("click", () => {
      const file = elements.inventoryFile.files?.[0];
      if (!file) {
        window.alert("Choose an XLSX file first.");
        return;
      }
      importInventoryXlsx(file);
    });
  }

  if (elements.addExpense) {
    elements.addExpense.addEventListener("click", addExpense);
  }
  if (elements.expenseDate) {
    elements.expenseDate.addEventListener("change", renderExpenses);
  }
};

const exportCsv = () => {
  const todaySales = getTodaySales();
  if (todaySales.length === 0) {
    return;
  }

  const itemTotals = new Map();
  let grossTotal = 0;
  let cashTotal = 0;
  let gcashTotal = 0;
  let foodpandaTotal = 0;
  let itemsSold = 0;
  const detailRows = [];

  todaySales.forEach((sale) => {
    const time = new Date(sale.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const customer = sale.customerNumber ? sale.customerNumber : "Walk-in";
    const payment = sale.paymentMethod ? sale.paymentMethod.toUpperCase() : "CASH";
    const saleTotal = sale.totalDue || 0;
    grossTotal += saleTotal;
    if (payment === "GCASH") {
      gcashTotal += saleTotal;
    } else if (payment === "FOODPANDA") {
      foodpandaTotal += saleTotal;
    } else {
      cashTotal += saleTotal;
    }
    if (sale.lines.length === 0) {
      detailRows.push([sale.id, time, customer, payment, "", "", "", "", saleTotal.toFixed(2)]);
      return;
    }
    sale.lines.forEach((line) => {
      itemsSold += line.qty;
      const current = itemTotals.get(line.name) || { qty: 0, total: 0 };
      current.qty += line.qty;
      current.total += calcLineTotal(line.price, line.qty);
      itemTotals.set(line.name, current);
      detailRows.push([
        sale.id,
        time,
        customer,
        payment,
        line.name,
        String(line.qty),
        line.price.toFixed(2),
        calcLineTotal(line.price, line.qty).toFixed(2),
        saleTotal.toFixed(2)
      ]);
    });
  });

  const averageTicket = todaySales.length > 0 ? grossTotal / todaySales.length : 0;
  const foodpandaCommission = foodpandaTotal * 0.3;
  const foodpandaVat = foodpandaCommission * 0.12;
  const foodpandaNet = foodpandaTotal - foodpandaCommission - foodpandaVat;
  const rows = [
    ["DAILY SALES SUMMARY"],
    ["Sales Count", String(todaySales.length)],
    ["Gross Total", grossTotal.toFixed(2)],
    ["Items Sold", String(itemsSold)],
    ["Average Ticket", averageTicket.toFixed(2)],
    [],
    ["PAYMENT TOTALS"],
    ["Cash", cashTotal.toFixed(2)],
    ["GCash", gcashTotal.toFixed(2)],
    ["Foodpanda", foodpandaTotal.toFixed(2)],
    [],
    ["FOODPANDA BREAKDOWN"],
    ["Foodpanda Total", foodpandaTotal.toFixed(2)],
    ["Commission (30%)", foodpandaCommission.toFixed(2)],
    ["VAT on Commission (12%)", foodpandaVat.toFixed(2)],
    ["Net (after commission + VAT)", foodpandaNet.toFixed(2)],
    [],
    ["ITEM SUMMARY"],
    ["Item", "Qty Sold", "Sales Total"]
  ];

  Array.from(itemTotals.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([name, data]) => {
      rows.push([name, String(data.qty), data.total.toFixed(2)]);
    });

  rows.push([]);
  rows.push(["SALES DETAIL"]);
  rows.push([
    "Sale ID",
    "Time",
    "Customer",
    "Payment",
    "Item",
    "Qty",
    "Price",
    "Line Total",
    "Sale Total"
  ]);
  detailRows.forEach((row) => rows.push(row));

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
  elements.customerNumber = document.getElementById("customer-number");
  elements.orderNotes = document.getElementById("order-notes");
  elements.subtotalValue = document.getElementById("subtotal-value");
  elements.totalDueValue = document.getElementById("total-due-value");
  elements.cashReceived = document.getElementById("cash-received");
  elements.changeValue = document.getElementById("change-value");
  elements.completeSale = document.getElementById("complete-sale");
  elements.holdOrder = document.getElementById("hold-order");
  elements.openOrders = document.getElementById("open-orders");
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
  elements.itemStock = document.getElementById("item-stock");
  elements.itemFoodpandaPrice = document.getElementById("item-foodpanda-price");
  elements.itemCategory = document.getElementById("item-category");
  elements.itemActive = document.getElementById("item-active");
  elements.saveItem = document.getElementById("save-item");
  elements.cancelItem = document.getElementById("cancel-item");
  elements.itemsList = document.getElementById("items-list");
  elements.inventoryBody = document.getElementById("inventory-body");
  elements.inventoryDate = document.getElementById("inventory-date");
  elements.inventoryFile = document.getElementById("inventory-file");
  elements.importInventory = document.getElementById("import-inventory");
  elements.expenseDate = document.getElementById("expense-date");
  elements.expenseAmount = document.getElementById("expense-amount");
  elements.expenseCategory = document.getElementById("expense-category");
  elements.expenseNotes = document.getElementById("expense-notes");
  elements.addExpense = document.getElementById("add-expense");
  elements.expenseList = document.getElementById("expense-list");
  elements.expenseCount = document.getElementById("expense-count");
  elements.expenseTotal = document.getElementById("expense-total");

  state.menu = loadMenu();
  state.sales = loadSales();
  state.openOrders = loadOpenOrders();
  state.expenses = loadExpenses();
  state.selectedCategoryId = state.menu.categories[0]?.id || "";
  state.itemDraft.categoryId = state.menu.categories[0]?.id || "";

  if (elements.expenseDate) {
    elements.expenseDate.value = getLocalDateStamp();
  }

  wireEvents();
  renderAll();
  maybeQueueInventorySnapshot();
  flushSyncQueue();
  window.addEventListener("online", flushSyncQueue);
};

document.addEventListener("DOMContentLoaded", init);
