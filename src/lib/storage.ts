import { buildDefaultMenu } from "./defaultMenu";

const MENU_KEY = "pos_menu";
const SALES_KEY = "pos_sales";

export type Category = {
  id: string;
  name: string;
};

export type Item = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  active: boolean;
};

export type Menu = {
  categories: Category[];
  items: Item[];
};

export type SaleLine = {
  itemId: string;
  name: string;
  price: number;
  qty: number;
};

export type Sale = {
  id: string;
  paidAt: string;
  lines: SaleLine[];
  subtotal: number;
  totalDue: number;
  cashReceived: number;
  change: number;
};

const readJSON = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJSON = <T>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const getMenu = (): Menu => {
  const menu = readJSON<Menu | null>(MENU_KEY, null);
  if (!menu) {
    const seed = buildDefaultMenu();
    writeJSON(MENU_KEY, seed);
    return seed;
  }
  return menu;
};

export const saveMenu = (menu: Menu) => {
  writeJSON(MENU_KEY, menu);
};

export const resetMenu = (): Menu => {
  const seed = buildDefaultMenu();
  writeJSON(MENU_KEY, seed);
  return seed;
};

export const getSales = (): Sale[] => readJSON<Sale[]>(SALES_KEY, []);

export const saveSales = (sales: Sale[]) => {
  writeJSON(SALES_KEY, sales);
};

export const addSale = (sale: Sale) => {
  const sales = getSales();
  sales.push(sale);
  saveSales(sales);
};
