import type { Menu } from "./storage";

export const buildDefaultMenu = (): Menu => {
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
  const items: Menu["items"] = [];

  const addItem = (categoryName: string, name: string, price: number) => {
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

  const addGroup = (categoryName: string, price: number, names: string[]) => {
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

  addGroup("RICE TOPPINGS", 99, [
    "Fish Fillet",
    "Porkchop",
    "Siomai",
    "Sisig",
    "Chicken Nuggets"
  ]);

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
