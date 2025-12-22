export const toCents = (amount: number) => Math.round(amount * 100);

export const fromCents = (cents: number) => Math.round(cents) / 100;

export const addMoney = (...amounts: number[]) =>
  fromCents(amounts.reduce((sum, amount) => sum + toCents(amount), 0));

export const calcLineTotal = (price: number, qty: number) =>
  fromCents(toCents(price) * qty);

export const calcSubtotal = (lines: { price: number; qty: number }[]) =>
  lines.reduce((sum, line) => addMoney(sum, calcLineTotal(line.price, line.qty)), 0);

export const calcChange = (totalDue: number, cashReceived: number) => {
  if (cashReceived < totalDue) {
    return 0;
  }
  return fromCents(toCents(cashReceived) - toCents(totalDue));
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2
});

export const formatPeso = (amount: number) => pesoFormatter.format(amount);
