import type { Invoice, Product, Purchase, ReturnRecord, SaleItem } from '@/types';
import { parseDate } from '@/lib/date';

/* ---------------------------------------------------------------------------
 * Money math + report aggregations (pure functions, unit tested).
 * ------------------------------------------------------------------------- */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface LineLike {
  quantity: number;
  unitPrice: number;
}

export interface InvoiceTotalsInput {
  lines: LineLike[];
  /** Invoice level discount, absolute amount. */
  discount: number;
  /** Tax percentage, e.g. 15 for 15%. */
  taxRate: number;
  /** When true the line prices already contain the tax. */
  pricesIncludeTax: boolean;
}

export interface InvoiceTotals {
  /** Sum of the line totals before the invoice level discount. */
  subtotal: number;
  discount: number;
  /** Net amount the customer pays. */
  total: number;
  taxAmount: number;
  /** Base amount used for tax (net of tax). */
  taxableBase: number;
}

export function lineTotal(line: LineLike): number {
  return round2(line.quantity * line.unitPrice);
}

export function computeInvoiceTotals({
  lines,
  discount,
  taxRate,
  pricesIncludeTax,
}: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const safeDiscount = round2(Math.min(Math.max(discount, 0), subtotal));
  const afterDiscount = round2(subtotal - safeDiscount);
  const rate = Math.max(taxRate, 0) / 100;

  if (pricesIncludeTax) {
    const taxableBase = round2(afterDiscount / (1 + rate));
    const taxAmount = round2(afterDiscount - taxableBase);
    return { subtotal, discount: safeDiscount, total: afterDiscount, taxAmount, taxableBase };
  }

  const taxAmount = round2(afterDiscount * rate);
  return {
    subtotal,
    discount: safeDiscount,
    total: round2(afterDiscount + taxAmount),
    taxAmount,
    taxableBase: afterDiscount,
  };
}

/** True when the stored invoice prices were VAT inclusive (inferred, no extra field). */
export function isTaxInclusive(invoice: Pick<Invoice, 'total' | 'subtotal' | 'discount'>): boolean {
  return Math.abs(invoice.total - (invoice.subtotal - invoice.discount)) < 0.01;
}

/** Revenue excluding tax, after invoice discount and refunds. */
export function invoiceNetRevenue(invoice: Invoice): number {
  const gross = round2(
    invoice.subtotal - invoice.discount - (isTaxInclusive(invoice) ? invoice.taxAmount : 0),
  );
  return round2(Math.max(gross - (invoice.refunded ?? 0), 0));
}

export function invoiceCost(items: SaleItem[]): number {
  return round2(items.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0));
}

export function invoiceProfit(invoice: Invoice): number {
  return round2(invoiceNetRevenue(invoice) - invoiceCost(invoice.items));
}

export function invoiceDue(invoice: Invoice): number {
  return round2(Math.max(invoice.total - invoice.paid, 0));
}

export function invoiceStatusFor(total: number, paid: number): Invoice['status'] {
  if (paid <= 0) return 'pending';
  if (paid + 0.01 >= total) return 'paid';
  return 'partial';
}

export function itemMarginPercent(item: { unitPrice: number; unitCost: number }): number {
  if (!item.unitPrice) return 0;
  return round2(((item.unitPrice - item.unitCost) / item.unitPrice) * 100);
}

export function productMarginPercent(product: Pick<Product, 'price' | 'cost'>): number {
  if (!product.price) return 0;
  return round2(((product.price - product.cost) / product.price) * 100);
}

export function sumBy<T>(items: T[], pick: (item: T) => number): number {
  return round2(items.reduce((sum, item) => sum + (pick(item) || 0), 0));
}

export function countBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, number> {
  return items.reduce((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<K, number>);
}

/* ------------------------------- Inventory -------------------------------- */

export interface InventoryStats {
  productCount: number;
  activeCount: number;
  units: number;
  retailValue: number;
  costValue: number;
  lowStock: Product[];
  outOfStock: Product[];
}

export function inventoryStats(products: Product[], fallbackThreshold: number): InventoryStats {
  const active = products.filter((p) => p.active && p.category !== 'services');
  const lowStock = active.filter((p) => p.quantity > 0 && p.quantity <= (p.minQuantity || fallbackThreshold));
  const outOfStock = active.filter((p) => p.quantity <= 0);
  return {
    productCount: products.length,
    activeCount: active.length,
    units: active.reduce((sum, p) => sum + p.quantity, 0),
    retailValue: sumBy(active, (p) => p.quantity * p.price),
    costValue: sumBy(active, (p) => p.quantity * p.cost),
    lowStock,
    outOfStock,
  };
}

/* ------------------------------- Reporting -------------------------------- */

export interface SeriesPoint {
  key: string;
  label: string;
  /** ISO date of the bucket start. */
  date: string;
  value: number;
  secondary: number;
  count: number;
}

export type Granularity = 'day' | 'month';

export type BucketLabelFn = (iso: string, granularity: Granularity) => string;

function bucketKey(date: Date, granularity: Granularity): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  if (granularity === 'month') return `${y}-${m}`;
  return `${y}-${m}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Builds a zero filled sales/profit series for the last `buckets` days or months.
 * Returns the oldest bucket first. `secondary` holds the gross profit.
 */
export function salesSeries(
  invoices: Invoice[],
  buckets: number,
  granularity: Granularity,
  labelFn: BucketLabelFn,
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const now = new Date();
  const index = new Map<string, SeriesPoint>();

  for (let i = buckets - 1; i >= 0; i -= 1) {
    const anchor =
      granularity === 'day'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12)
        : new Date(now.getFullYear(), now.getMonth() - i, 1, 12);
    const key = bucketKey(anchor, granularity);
    const iso = anchor.toISOString();
    const point: SeriesPoint = { key, date: iso, label: labelFn(iso, granularity), value: 0, secondary: 0, count: 0 };
    out.push(point);
    index.set(key, point);
  }

  invoices
    .filter((inv) => inv.status !== 'cancelled')
    .forEach((inv) => {
      const date = parseDate(inv.createdAt);
      if (!date) return;
      const point = index.get(bucketKey(date, granularity));
      if (!point) return;
      point.value = round2(point.value + (inv.total - (inv.refunded ?? 0)));
      point.secondary = round2(point.secondary + invoiceProfit(inv));
      point.count += 1;
    });

  return out;
}

/* ----------------------------- Breakdowns -------------------------------- */

export interface BreakdownSlice {
  key: string;
  value: number;
  count: number;
}

export function salesByCategory(invoices: Invoice[]): BreakdownSlice[] {
  const map = new Map<string, BreakdownSlice>();
  invoices
    .filter((inv) => inv.status !== 'cancelled')
    .forEach((inv) => {
      inv.items.forEach((item) => {
        const existing = map.get(item.category) ?? { key: item.category, value: 0, count: 0 };
        existing.value = round2(existing.value + lineTotal(item));
        existing.count += item.quantity;
        map.set(item.category, existing);
      });
    });
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export function salesByPaymentMethod(invoices: Invoice[]): BreakdownSlice[] {
  const map = new Map<string, BreakdownSlice>();
  invoices
    .filter((inv) => inv.status !== 'cancelled')
    .forEach((inv) => {
      const existing = map.get(inv.paymentMethod) ?? { key: inv.paymentMethod, value: 0, count: 0 };
      existing.value = round2(existing.value + inv.total);
      existing.count += 1;
      map.set(inv.paymentMethod, existing);
    });
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export interface ProductSalesRow {
  productId: string;
  nameAr: string;
  nameEn: string;
  sku: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export function productSales(invoices: Invoice[]): ProductSalesRow[] {
  const map = new Map<string, ProductSalesRow>();
  invoices
    .filter((inv) => inv.status !== 'cancelled')
    .forEach((inv) => {
      inv.items.forEach((item) => {
        const row =
          map.get(item.productId) ??
          ({
            productId: item.productId,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            sku: item.sku,
            quantity: 0,
            revenue: 0,
            profit: 0,
          } satisfies ProductSalesRow);
        row.quantity += item.quantity;
        row.revenue = round2(row.revenue + lineTotal(item));
        row.profit = round2(row.profit + (item.unitPrice - item.unitCost) * item.quantity);
        map.set(item.productId, row);
      });
    });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export interface CustomerSalesRow {
  customerId: string;
  name: string;
  phone?: string;
  invoiceCount: number;
  revenue: number;
  due: number;
}

export function customerSales(invoices: Invoice[]): CustomerSalesRow[] {
  const map = new Map<string, CustomerSalesRow>();
  invoices
    .filter((inv) => inv.status !== 'cancelled' && inv.customerId)
    .forEach((inv) => {
      const id = inv.customerId as string;
      const row =
        map.get(id) ??
        ({
          customerId: id,
          name: inv.customerName,
          phone: inv.customerPhone,
          invoiceCount: 0,
          revenue: 0,
          due: 0,
        } satisfies CustomerSalesRow);
      row.invoiceCount += 1;
      row.revenue = round2(row.revenue + inv.total);
      row.due = round2(row.due + invoiceDue(inv));
      map.set(id, row);
    });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

/* --------------------------------- Totals --------------------------------- */

export function receivables(invoices: Invoice[]): number {
  return sumBy(
    invoices.filter((inv) => inv.status !== 'cancelled' && inv.status !== 'returned'),
    (inv) => invoiceDue(inv),
  );
}

export function payables(purchases: Purchase[]): number {
  return sumBy(
    purchases.filter((p) => p.status !== 'cancelled'),
    (p) => Math.max(p.total - p.paid, 0),
  );
}

export function returnsTotal(returns: ReturnRecord[]): number {
  return sumBy(returns, (r) => r.amount);
}

export function refundableAmount(invoice: Invoice): number {
  return round2(Math.max(invoice.total - (invoice.refunded ?? 0), 0));
}

/** VAT collected over a set of invoices (for tax reporting). */
export function taxCollected(invoices: Invoice[]): number {
  return sumBy(
    invoices.filter((inv) => inv.status !== 'cancelled'),
    (inv) => Math.max(inv.taxAmount, 0),
  );
}


