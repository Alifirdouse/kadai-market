// Order totals are always computed on the server from database prices,
// never trusted from the browser.

export function computeTotals(lines, { freeShippingAbove = 499, shippingFee = 40 } = {}) {
  let subtotal = 0;
  let mrpTotal = 0;
  for (const { price, mrp, qty } of lines) {
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Quantity must be a positive whole number');
    subtotal += price * qty;
    mrpTotal += (mrp ?? price) * qty;
  }
  subtotal = round2(subtotal);
  mrpTotal = round2(mrpTotal);
  const shipping = subtotal === 0 || subtotal >= freeShippingAbove ? 0 : shippingFee;
  const total = round2(subtotal + shipping);
  return { subtotal, mrpTotal, savings: round2(mrpTotal - subtotal), shipping, total };
}

// Razorpay expects the smallest currency unit (paise)
export const toPaise = (rupees) => Math.round(rupees * 100);

const round2 = (n) => Math.round(n * 100) / 100;
