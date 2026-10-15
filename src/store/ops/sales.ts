import type { Database, ID, Invoice, PaymentMethod, PaymentRecord, ReturnRecord, SaleItem } from '@/types';
import { nowISO } from '@/lib/date';
import { uid } from '@/lib/id';
import { computeInvoiceTotals, invoiceStatusFor, round2 } from '@/lib/calc';
import { allocateNumber, applyStockChange, findById, removeById, upsert, type Actor } from './shared';
import { awardLoyaltyPoints } from './people';

/* ---------------------------------------------------------------------------
 * Sales operations: invoices, payments and returns.
 * Stock is always adjusted together with the document that caused it.
 * ------------------------------------------------------------------------- */

export interface CreateInvoiceInput {
  customerId?: ID;
  customerName: string;
  customerPhone?: string;
  items: SaleItem[];
  discount: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  prescriptionId?: ID;
  labOrderId?: ID;
  insuranceCompany?: string;
  notes?: string;
  date?: string;
}

function isStocked(db: Database, productId: ID): boolean {
  const product = findById(db.products, productId);
  return Boolean(product && product.category !== 'services');
}

export function createInvoice(
  db: Database,
  input: CreateInvoiceInput,
  actor: Actor,
): { db: Database; invoice: Invoice } {
  const allocation = allocateNumber(db, 'invoices');
  const totals = computeInvoiceTotals({
    lines: input.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
    discount: input.discount,
    taxRate: allocation.db.settings.taxRate,
    pricesIncludeTax: allocation.db.settings.pricesIncludeTax,
  });

  const date = input.date ?? nowISO();
  const paid = round2(Math.min(Math.max(input.amountPaid, 0), totals.total));
  const payment: PaymentRecord | null =
    paid > 0 ? { id: uid('pay'), date, amount: paid, method: input.paymentMethod, userId: actor.id } : null;

  const invoice: Invoice = {
    id: uid('inv'),
    number: allocation.number,
    date,
    createdAt: date,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    items: input.items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxRate: allocation.db.settings.taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    paid,
    payments: payment ? [payment] : [],
    paymentMethod: input.paymentMethod,
    status: invoiceStatusFor(totals.total, paid),
    prescriptionId: input.prescriptionId,
    labOrderId: input.labOrderId,
    insuranceCompany: input.insuranceCompany,
    notes: input.notes,
    refunded: 0,
    userId: actor.id,
    userName: actor.name,
  };

  let next: Database = allocation.db;
  input.items.forEach((item) => {
    if (!isStocked(next, item.productId)) return;
    next = applyStockChange(next, item.productId, -item.quantity, {
      type: 'sale',
      actor,
      reference: invoice.number,
      date,
    });
  });

  next = { ...next, invoices: [invoice, ...next.invoices] };
  next = awardLoyaltyPoints(next, input.customerId, totals.total);
  return { db: next, invoice };
}

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  note?: string;
}

export function addPayment(db: Database, invoiceId: ID, input: PaymentInput, actor: Actor): Database {
  const invoice = findById(db.invoices, invoiceId);
  if (!invoice) return db;
  const due = round2(Math.max(invoice.total - invoice.paid, 0));
  const amount = round2(Math.min(Math.max(input.amount, 0), due));
  if (amount <= 0) return db;
  const record: PaymentRecord = {
    id: uid('pay'),
    date: nowISO(),
    amount,
    method: input.method,
    userId: actor.id,
    note: input.note,
  };
  const paid = round2(invoice.paid + amount);
  const updated: Invoice = {
    ...invoice,
    paid,
    payments: [...invoice.payments, record],
    status: invoiceStatusFor(invoice.total, paid),
  };
  return { ...db, invoices: upsert(db.invoices, updated) };
}

/** Restores the stock of every stocked line of an invoice. */
function restoreInvoiceStock(db: Database, invoice: Invoice, actor: Actor, reason: string): Database {
  let next = db;
  invoice.items.forEach((item) => {
    if (!isStocked(next, item.productId)) return;
    next = applyStockChange(next, item.productId, item.quantity, {
      type: 'return',
      actor,
      reference: invoice.number,
      reason,
    });
  });
  return next;
}

export function cancelInvoice(db: Database, invoiceId: ID, actor: Actor): Database {
  const invoice = findById(db.invoices, invoiceId);
  if (!invoice || invoice.status === 'cancelled') return db;
  const next = restoreInvoiceStock(db, invoice, actor, 'إلغاء فاتورة');
  return { ...next, invoices: upsert(next.invoices, { ...invoice, status: 'cancelled' }) };
}

export function deleteInvoice(db: Database, invoiceId: ID, actor: Actor): Database {
  const invoice = findById(db.invoices, invoiceId);
  if (!invoice) return db;
  const next = invoice.status === 'cancelled' ? db : restoreInvoiceStock(db, invoice, actor, 'حذف فاتورة');
  return {
    ...next,
    invoices: removeById(next.invoices, invoiceId),
    returns: next.returns.filter((item) => item.invoiceId !== invoiceId),
  };
}

export interface ReturnInput {
  invoiceId: ID;
  lines: Array<{ productId: ID; quantity: number }>;
  refundMethod: PaymentMethod;
  reason?: string;
}

/** Already returned quantity for a given product on a given invoice. */
export function returnedQuantity(db: Database, invoiceId: ID, productId: ID): number {
  return db.returns
    .filter((record) => record.invoiceId === invoiceId)
    .reduce(
      (total, record) =>
        total +
        record.lines.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0),
      0,
    );
}

export function createReturn(
  db: Database,
  input: ReturnInput,
  actor: Actor,
): { db: Database; record: ReturnRecord | null } {
  const invoice = findById(db.invoices, input.invoiceId);
  if (!invoice) return { db, record: null };

  const lines = input.lines
    .map((line) => {
      const item = invoice.items.find((entry) => entry.productId === line.productId);
      if (!item) return null;
      const alreadyReturned = returnedQuantity(db, invoice.id, line.productId);
      const quantity = Math.min(Math.max(Math.floor(line.quantity), 0), item.quantity - alreadyReturned);
      if (quantity <= 0) return null;
      return {
        productId: line.productId,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        quantity,
        amount: round2(quantity * item.unitPrice),
      };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

  if (lines.length === 0) return { db, record: null };

  const allocation = allocateNumber(db, 'returns');
  const amount = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const record: ReturnRecord = {
    id: uid('ret'),
    number: allocation.number,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    date: nowISO(),
    lines,
    amount,
    refundMethod: input.refundMethod,
    reason: input.reason,
    userId: actor.id,
    userName: actor.name,
  };

  let next: Database = allocation.db;
  lines.forEach((line) => {
    if (!isStocked(next, line.productId)) return;
    next = applyStockChange(next, line.productId, line.quantity, {
      type: 'return',
      actor,
      reference: record.number,
      reason: input.reason,
    });
  });

  const refunded = round2(invoice.refunded + amount);
  const updated: Invoice = {
    ...invoice,
    refunded,
    status: refunded + 0.01 >= invoice.total ? 'returned' : invoice.status,
  };

  return {
    db: { ...next, returns: [record, ...next.returns], invoices: upsert(next.invoices, updated) },
    record,
  };
}

