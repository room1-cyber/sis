import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n } from '@/i18n';
import {
  Badge,
  DataTable,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  StatCard,
  Toolbar,
  type Column,
} from '@/components/ui';
import { useConfirm, useToast } from '@/components/feedback';
import { PURCHASE_STATUS_TONE } from '@/pages/labOrderMeta';
import { payables, round2, sumBy } from '@/lib/calc';
import { atNoon, toDateInput, todayInput } from '@/lib/date';
import { downloadCsv } from '@/store/db';
import type { PurchaseInput, PurchaseLineInput } from '@/store/ops/workflow';
import type { ID, Product, Purchase, PurchaseStatus, Supplier } from '@/types';

/* ---------------------------------------------------------------------------
 * Purchases – purchase orders, stock receiving and supplier payments.
 * ------------------------------------------------------------------------- */

const PURCHASE_STATUSES: PurchaseStatus[] = ['draft', 'ordered', 'received', 'cancelled'];

type PurchaseStatusKey =
  | 'purchases.status.draft'
  | 'purchases.status.ordered'
  | 'purchases.status.received'
  | 'purchases.status.cancelled';

const STATUS_LABEL_KEY: Record<PurchaseStatus, PurchaseStatusKey> = {
  draft: 'purchases.status.draft',
  ordered: 'purchases.status.ordered',
  received: 'purchases.status.received',
  cancelled: 'purchases.status.cancelled',
};

function remainingOf(purchase: Purchase): number {
  return round2(Math.max(purchase.total - purchase.paid, 0));
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Receive dialog – books the received quantities into stock. */
function ReceiveModal({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const { t, pick, num, qty } = useI18n();
  const toast = useToast();
  const { receivePurchase } = useData();
  const [receipts, setReceipts] = useState<Record<ID, string>>({});

  const remainingFor = (line: Purchase['lines'][number]) => Math.max(line.quantity - line.receivedQty, 0);

  useEffect(() => {
    if (!purchase) return;
    const next: Record<ID, string> = {};
    purchase.lines.forEach((line) => {
      next[line.id] = String(Math.max(line.quantity - line.receivedQty, 0));
    });
    setReceipts(next);
  }, [purchase]);

  const receiveAll = () => {
    if (!purchase) return;
    const all: Record<ID, string> = {};
    purchase.lines.forEach((line) => {
      all[line.id] = String(Math.max(line.quantity - line.receivedQty, 0));
    });
    setReceipts(all);
  };

  const submit = () => {
    if (!purchase) return;
    const payload: Record<ID, number> = {};
    purchase.lines.forEach((line) => {
      payload[line.id] = Math.max(numberOrZero(receipts[line.id] ?? '0'), 0);
    });
    receivePurchase(purchase.id, payload);
    toast.success(t('purchases.receivedSuccess'));
    onClose();
  };

  return (
    <Modal
      open={Boolean(purchase)}
      onClose={onClose}
      size="sm"
      title={t('purchases.receive')}
      subtitle={purchase ? `${purchase.number} — ${purchase.supplierName}` : undefined}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={receiveAll}>
            {t('purchases.receiveAll')}
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            {t('purchases.receive')}
          </button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th className="text-start">{t('stock.product')}</th>
              <th className="text-center">{t('common.quantity')}</th>
              <th className="text-center">{t('purchases.qtyReceived')}</th>
              <th className="text-center">{t('common.remaining')}</th>
              <th className="text-center">{t('purchases.receive')}</th>
            </tr>
          </thead>
          <tbody>
            {(purchase?.lines ?? []).map((line) => (
              <tr key={line.id}>
                <td className="text-start">
                  <span className="block text-sm font-semibold text-slate-700">{pick(line.nameAr, line.nameEn)}</span>
                  <span className="text-xs text-slate-400">{line.sku}</span>
                </td>
                <td className="num text-center">{qty(line.quantity)}</td>
                <td className="num text-center">{qty(line.receivedQty)}</td>
                <td className="num text-center">{qty(remainingFor(line))}</td>
                <td className="text-center">
                  <input
                    className="input w-20 text-center"
                    dir="ltr"
                    type="number"
                    min={0}
                    max={remainingFor(line)}
                    value={receipts[line.id] ?? ''}
                    onChange={(event) =>
                      setReceipts((current) => ({ ...current, [line.id]: event.target.value }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {num(purchase?.lines.length ?? 0)} {t('common.items')}
      </p>
    </Modal>
  );
}

/** Payment dialog – records a supplier payment against the order. */
function PayModal({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const { t, money } = useI18n();
  const toast = useToast();
  const { payPurchase } = useData();
  const [amount, setAmount] = useState('');

  useEffect(() => {
    setAmount(purchase ? String(remainingOf(purchase)) : '');
  }, [purchase]);

  const submit = () => {
    if (!purchase) return;
    const value = numberOrZero(amount);
    if (value <= 0) return;
    payPurchase(purchase.id, value);
    toast.success(t('suppliers.paid'));
    onClose();
  };

  return (
    <Modal
      open={Boolean(purchase)}
      onClose={onClose}
      size="sm"
      title={t('purchases.payPurchase')}
      subtitle={
        purchase
          ? `${purchase.number} — ${t('common.remaining')}: ${money(remainingOf(purchase))}`
          : undefined
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <Field label={t('common.amount')} required>
        <input
          className="input"
          dir="ltr"
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
    </Modal>
  );
}

interface LineDraft {
  productId: string;
  quantity: string;
  unitCost: string;
}

interface PurchaseFormState {
  supplierId: string;
  date: string;
  expectedDate: string;
  lines: LineDraft[];
  paid: string;
  status: PurchaseStatus;
  notes: string;
}

function emptyLine(): LineDraft {
  return { productId: '', quantity: '1', unitCost: '' };
}

function emptyForm(): PurchaseFormState {
  return {
    supplierId: '',
    date: todayInput(),
    expectedDate: '',
    lines: [emptyLine()],
    paid: '0',
    status: 'draft',
    notes: '',
  };
}

function toFormState(purchase?: Purchase | null): PurchaseFormState {
  if (!purchase) return emptyForm();
  return {
    supplierId: purchase.supplierId,
    date: toDateInput(purchase.date),
    expectedDate: toDateInput(purchase.expectedDate),
    lines: purchase.lines.length
      ? purchase.lines.map((line) => ({
          productId: line.productId,
          quantity: String(line.quantity),
          unitCost: String(line.unitCost),
        }))
      : [emptyLine()],
    paid: String(purchase.paid),
    status: purchase.status,
    notes: purchase.notes ?? '',
  };
}

/** Create / edit dialog for a purchase order, with a live VAT preview. */
function PurchaseFormModal({
  open,
  onClose,
  purchase,
  products,
  suppliers,
}: {
  open: boolean;
  onClose: () => void;
  purchase: Purchase | null;
  products: Product[];
  suppliers: Supplier[];
}) {
  const { t, pick, money, num } = useI18n();
  const toast = useToast();
  const { createPurchase, updatePurchase, settings } = useData();
  const [form, setForm] = useState<PurchaseFormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(toFormState(purchase));
      setErrors({});
    }
  }, [open, purchase]);

  const totals = useMemo(() => {
    const subtotal = round2(
      form.lines.reduce((sum, line) => sum + numberOrZero(line.quantity) * numberOrZero(line.unitCost), 0),
    );
    const taxAmount = round2(subtotal * (Math.max(settings.taxRate, 0) / 100));
    return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
  }, [form.lines, settings.taxRate]);

  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    }));

  const pickProduct = (index: number, productId: string) => {
    const product = products.find((item) => item.id === productId);
    setLine(index, { productId, unitCost: product ? String(product.cost) : '' });
  };

  const addLine = () => setForm((current) => ({ ...current, lines: [...current.lines, emptyLine()] }));

  const removeLine = (index: number) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, position) => position !== index),
    }));

  const submit = (status?: PurchaseStatus) => {
    const lines: PurchaseLineInput[] = form.lines
      .filter((line) => line.productId && numberOrZero(line.quantity) > 0)
      .map((line) => ({
        productId: line.productId,
        quantity: numberOrZero(line.quantity),
        unitCost: numberOrZero(line.unitCost),
      }));

    const next: Record<string, string> = {};
    if (!form.supplierId) next.supplierId = t('validation.required');
    if (!form.date) next.date = t('validation.required');
    if (lines.length === 0) next.lines = t('validation.atLeastOneItem');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload: PurchaseInput = {
      supplierId: form.supplierId,
      date: atNoon(form.date),
      expectedDate: form.expectedDate ? atNoon(form.expectedDate) : undefined,
      lines,
      paid: numberOrZero(form.paid),
      status: status ?? form.status,
      notes: form.notes.trim() || undefined,
    };

    if (purchase) {
      updatePurchase(purchase.id, payload);
      toast.success(t('common.saved'));
    } else {
      createPurchase(payload);
      toast.success(t('purchases.created'));
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={purchase ? t('purchases.edit') : t('purchases.new')}
      subtitle={purchase ? purchase.number : undefined}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {(!purchase || purchase.status === 'draft') && (
            <button type="button" className="btn-secondary" onClick={() => submit('draft')}>
              {t('purchases.saveDraft')}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => submit()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('purchases.supplier')} required error={errors.supplierId}>
            <select
              className="select"
              value={form.supplierId}
              onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}
            >
              <option value="">{t('purchases.selectSupplier')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('common.status')}>
            <select
              className="select"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value as PurchaseStatus }))
              }
            >
              {PURCHASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(STATUS_LABEL_KEY[status])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('purchases.orderDate')} required error={errors.date}>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </Field>
          <Field label={t('purchases.expectedDate')}>
            <input
              type="date"
              className="input"
              value={form.expectedDate}
              onChange={(event) => setForm((current) => ({ ...current, expectedDate: event.target.value }))}
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="section-title mb-0">{t('purchases.lines')}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={addLine}>
              ➕ {t('purchases.addLine')}
            </button>
          </div>
          {errors.lines && <p className="field-error mb-2">{errors.lines}</p>}
          <div className="space-y-2">
            {form.lines.map((line, index) => (
              <div key={index} className="grid grid-cols-12 items-end gap-2">
                <Field
                  className="col-span-12 sm:col-span-6"
                  label={index === 0 ? t('stock.product') : undefined}
                >
                  <select
                    className="select"
                    value={line.productId}
                    onChange={(event) => pickProduct(index, event.target.value)}
                  >
                    <option value="">{t('common.select')}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {pick(product.nameAr, product.nameEn)} — {product.sku}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  className="col-span-4 sm:col-span-2"
                  label={index === 0 ? t('common.quantity') : undefined}
                >
                  <input
                    className="input"
                    dir="ltr"
                    type="number"
                    min={0}
                    value={line.quantity}
                    onChange={(event) => setLine(index, { quantity: event.target.value })}
                  />
                </Field>
                <Field
                  className="col-span-4 sm:col-span-2"
                  label={index === 0 ? t('purchases.unitCost') : undefined}
                >
                  <input
                    className="input"
                    dir="ltr"
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.unitCost}
                    onChange={(event) => setLine(index, { unitCost: event.target.value })}
                  />
                </Field>
                <div className="col-span-4 flex items-center justify-end gap-2 sm:col-span-2">
                  <span className="num text-sm font-bold text-slate-700">
                    {money(numberOrZero(line.quantity) * numberOrZero(line.unitCost))}
                  </span>
                  <button
                    type="button"
                    className="btn-icon hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title={t('common.delete')}
                    disabled={form.lines.length === 1}
                    onClick={() => removeLine(index)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.paid')}>
            <input
              className="input"
              dir="ltr"
              type="number"
              min={0}
              step={0.01}
              value={form.paid}
              onChange={(event) => setForm((current) => ({ ...current, paid: event.target.value }))}
            />
          </Field>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500">{t('common.subtotal')}</span>
              <span className="num font-semibold text-slate-700">{money(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500">
                {t('common.vat')} ({num(settings.taxRate)}%)
              </span>
              <span className="num font-semibold text-slate-700">{money(totals.taxAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
              <span>{t('common.total')}</span>
              <span className="num">{money(totals.total)}</span>
            </div>
          </div>
        </div>

        <Field label={t('common.notes')}>
          <textarea
            className="textarea"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function Purchases() {
  const { t, pick, money, moneyShort, num, date } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const {
    purchases,
    products,
    suppliers,
    supplierById,
    setPurchaseStatus,
    deletePurchase,
  } = useData();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseStatus>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [receiving, setReceiving] = useState<Purchase | null>(null);
  const [paying, setPaying] = useState<Purchase | null>(null);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return purchases
      .filter((purchase) => {
        const matchesTerm =
          !term || [purchase.number, purchase.supplierName].some((value) => value.toLowerCase().includes(term));
        const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
        return matchesTerm && matchesStatus;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [purchases, query, statusFilter]);

  const stats = useMemo(() => {
    const open = purchases.filter((purchase) => purchase.status === 'draft' || purchase.status === 'ordered');
    const received = purchases.filter((purchase) => purchase.status === 'received');
    return {
      openCount: open.length,
      openValue: sumBy(open, (purchase) => purchase.total),
      payables: payables(purchases),
      receivedValue: sumBy(received, (purchase) => purchase.total),
    };
  }, [purchases]);

  const handleDelete = async (purchase: Purchase) => {
    const ok = await confirm({ message: t('common.deleteConfirmBody') });
    if (!ok) return;
    deletePurchase(purchase.id);
    toast.success(t('common.deleted'));
  };

  const exportCsv = () => {
    downloadCsv(
      'purchases.csv',
      rows.map((purchase) => ({
        number: purchase.number,
        supplier: purchase.supplierName,
        date: purchase.date,
        expectedDate: purchase.expectedDate ?? '',
        lines: purchase.lines.length,
        subtotal: purchase.subtotal,
        taxAmount: purchase.taxAmount,
        total: purchase.total,
        paid: purchase.paid,
        remaining: remainingOf(purchase),
        status: t(STATUS_LABEL_KEY[purchase.status]),
      })),
    );
  };

  const columns: Array<Column<Purchase>> = [
    {
      key: 'number',
      header: t('purchases.number'),
      render: (purchase) => <span className="font-semibold text-slate-700">{purchase.number}</span>,
      sortValue: (purchase) => purchase.number,
    },
    {
      key: 'supplier',
      header: t('purchases.supplier'),
      render: (purchase) => {
        const supplier = supplierById(purchase.supplierId);
        return (
          <span className="block">
            <span className="block font-semibold text-slate-700">{purchase.supplierName}</span>
            {supplier?.phone && (
              <span className="block text-xs text-slate-400" dir="ltr">
                {supplier.phone}
              </span>
            )}
          </span>
        );
      },
      sortValue: (purchase) => purchase.supplierName,
    },
    {
      key: 'date',
      header: t('purchases.orderDate'),
      render: (purchase) => date(purchase.date),
      sortValue: (purchase) => purchase.date,
    },
    {
      key: 'expectedDate',
      header: t('purchases.expectedDate'),
      render: (purchase) => (purchase.expectedDate ? date(purchase.expectedDate) : t('common.nA')),
      sortValue: (purchase) => purchase.expectedDate ?? '',
    },
    {
      key: 'lines',
      header: t('purchases.lines'),
      align: 'center',
      render: (purchase) => {
        const first = purchase.lines[0];
        return (
          <span className="block">
            <span className="num font-semibold">{num(purchase.lines.length)}</span>
            {first && (
              <span className="block text-xs text-slate-400">
                {pick(first.nameAr, first.nameEn)}
                {purchase.lines.length > 1 ? ` +${num(purchase.lines.length - 1)}` : ''}
              </span>
            )}
          </span>
        );
      },
      sortValue: (purchase) => purchase.lines.length,
    },
    {
      key: 'subtotal',
      header: t('common.subtotal'),
      align: 'end',
      render: (purchase) => <span className="num">{money(purchase.subtotal)}</span>,
      sortValue: (purchase) => purchase.subtotal,
    },
    {
      key: 'taxAmount',
      header: t('common.vat'),
      align: 'end',
      render: (purchase) => <span className="num">{money(purchase.taxAmount)}</span>,
      sortValue: (purchase) => purchase.taxAmount,
    },
    {
      key: 'total',
      header: t('common.total'),
      align: 'end',
      render: (purchase) => <span className="num font-bold text-slate-800">{money(purchase.total)}</span>,
      sortValue: (purchase) => purchase.total,
    },
    {
      key: 'paid',
      header: t('common.paid'),
      align: 'end',
      render: (purchase) => <span className="num text-emerald-600">{money(purchase.paid)}</span>,
      sortValue: (purchase) => purchase.paid,
    },
    {
      key: 'remaining',
      header: t('common.remaining'),
      align: 'end',
      render: (purchase) => {
        const due = remainingOf(purchase);
        return (
          <span className={`num font-semibold ${due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {money(due)}
          </span>
        );
      },
      sortValue: (purchase) => remainingOf(purchase),
    },
    {
      key: 'status',
      header: t('common.status'),
      align: 'center',
      render: (purchase) => (
        <Badge tone={PURCHASE_STATUS_TONE[purchase.status]}>{t(STATUS_LABEL_KEY[purchase.status])}</Badge>
      ),
      sortValue: (purchase) => purchase.status,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (purchase) => {
        const canManage = hasPermission('purchases.manage');
        const editable = purchase.status === 'draft' || purchase.status === 'ordered';
        const receivable = purchase.status !== 'received' && purchase.status !== 'cancelled';
        const due = remainingOf(purchase);
        return (
          <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            {canManage && editable && (
              <button
                type="button"
                className="btn-icon"
                title={t('common.edit')}
                onClick={() => {
                  setEditing(purchase);
                  setFormOpen(true);
                }}
              >
                ✏️
              </button>
            )}
            {canManage && purchase.status === 'draft' && (
              <button
                type="button"
                className="btn-icon"
                title={t('purchases.markOrdered')}
                onClick={() => {
                  setPurchaseStatus(purchase.id, 'ordered');
                  toast.success(t('common.saved'));
                }}
              >
                📤
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="btn-icon disabled:cursor-not-allowed disabled:opacity-40"
                title={t('purchases.receive')}
                disabled={!receivable}
                onClick={() => setReceiving(purchase)}
              >
                📥
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="btn-icon disabled:cursor-not-allowed disabled:opacity-40"
                title={t('purchases.payPurchase')}
                disabled={due <= 0}
                onClick={() => setPaying(purchase)}
              >
                💵
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="btn-icon hover:bg-rose-50 hover:text-rose-600"
                title={t('common.delete')}
                onClick={() => handleDelete(purchase)}
              >
                🗑️
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('purchases.title')}
        subtitle={t('purchases.subtitle')}
        actions={
          hasPermission('purchases.manage') ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              ➕ {t('purchases.new')}
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('purchases.title')} value={num(purchases.length)} tone="brand" icon="🧾" />
        <StatCard
          label={t('lab.inProgress')}
          value={num(stats.openCount)}
          tone="blue"
          icon="📦"
          hint={moneyShort(stats.openValue)}
        />
        <StatCard label={t('dashboard.payables')} value={moneyShort(stats.payables)} tone="red" icon="⏳" />
        <StatCard
          label={t('purchases.status.received')}
          value={moneyShort(stats.receivedValue)}
          tone="green"
          icon="📥"
        />
      </div>

      <Toolbar>
        <SearchInput
          className="w-full sm:max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={t('purchases.number')}
        />
        <select
          className="select w-auto"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
        >
          <option value="all">
            {t('common.status')}: {t('common.all')}
          </option>
          {PURCHASE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(STATUS_LABEL_KEY[status])}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={exportCsv}>
          ⬇️ {t('common.exportCsv')}
        </button>
        <span className="ms-auto text-sm text-slate-500">
          {num(rows.length)} {t('common.of')} {num(purchases.length)}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(purchase) => purchase.id}
        pageSize={25}
        empty={<p className="px-5 py-10 text-center text-sm text-slate-400">{t('purchases.noPurchases')}</p>}
      />

      <PurchaseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        purchase={editing}
        products={products}
        suppliers={suppliers}
      />
      <ReceiveModal purchase={receiving} onClose={() => setReceiving(null)} />
      <PayModal purchase={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
