import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n } from '@/i18n';
import {
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
import { payables } from '@/lib/calc';
import { downloadCsv } from '@/store/db';
import type { Supplier } from '@/types';

/* ---------------------------------------------------------------------------
 * Suppliers: directory + payables. Create / edit / delete / pay are guarded by
 * the `suppliers.manage` permission, exporting is always available.
 * ------------------------------------------------------------------------- */

interface SupplierFormState {
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  notes: string;
  balance: string;
}

const EMPTY_FORM: SupplierFormState = {
  name: '',
  code: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  taxNumber: '',
  notes: '',
  balance: '0',
};

function toFormState(supplier?: Supplier | null): SupplierFormState {
  if (!supplier) return { ...EMPTY_FORM };
  return {
    name: supplier.name,
    code: supplier.code,
    contactPerson: supplier.contactPerson ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    address: supplier.address ?? '',
    taxNumber: supplier.taxNumber ?? '',
    notes: supplier.notes ?? '',
    balance: String(supplier.balance),
  };
}

/** Create / edit dialog for a supplier. */
function SupplierFormModal({
  open,
  onClose,
  supplier,
}: {
  open: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { addSupplier, updateSupplier } = useData();
  const [form, setForm] = useState<SupplierFormState>(toFormState(supplier));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(toFormState(supplier));
      setErrors({});
    }
  }, [open, supplier]);

  const set = <K extends keyof SupplierFormState>(key: K, value: SupplierFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    if (!form.name.trim()) {
      setErrors({ name: t('validation.required') });
      return;
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      contactPerson: form.contactPerson.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      taxNumber: form.taxNumber.trim() || undefined,
      notes: form.notes.trim() || undefined,
      balance: Number(form.balance) || 0,
    };
    if (supplier) updateSupplier(supplier.id, payload);
    else addSupplier(payload);
    toast.success(supplier ? t('common.saved') : t('suppliers.created'));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? t('suppliers.edit') : t('suppliers.new')}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('suppliers.name')} required error={errors.name} className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label={t('suppliers.code')}>
          <input
            className="input"
            dir="ltr"
            value={form.code}
            onChange={(event) => set('code', event.target.value)}
          />
        </Field>
        <Field label={t('suppliers.contactPerson')}>
          <input
            className="input"
            value={form.contactPerson}
            onChange={(event) => set('contactPerson', event.target.value)}
          />
        </Field>
        <Field label={t('common.phone')}>
          <input
            className="input"
            dir="ltr"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
          />
        </Field>
        <Field label={t('common.email')}>
          <input
            className="input"
            dir="ltr"
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
          />
        </Field>
        <Field label={t('suppliers.taxNumber')}>
          <input
            className="input"
            dir="ltr"
            value={form.taxNumber}
            onChange={(event) => set('taxNumber', event.target.value)}
          />
        </Field>
        <Field label={t('suppliers.balance')}>
          <input
            className="input"
            dir="ltr"
            type="number"
            step="0.01"
            value={form.balance}
            onChange={(event) => set('balance', event.target.value)}
          />
        </Field>
        <Field label={t('common.address')} className="sm:col-span-2">
          <input className="input" value={form.address} onChange={(event) => set('address', event.target.value)} />
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <textarea className="textarea" value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Records a payment towards the supplier balance. */
function SupplierPaymentModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const { t, money } = useI18n();
  const toast = useToast();
  const { paySupplier } = useData();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (supplier) {
      setAmount(supplier.balance > 0 ? String(supplier.balance) : '');
      setError('');
    }
  }, [supplier]);

  const submit = () => {
    if (!supplier) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('validation.positiveNumber'));
      return;
    }
    paySupplier(supplier.id, value);
    toast.success(t('suppliers.paid'));
    onClose();
  };

  return (
    <Modal
      open={Boolean(supplier)}
      onClose={onClose}
      size="sm"
      title={t('suppliers.paySupplier')}
      subtitle={supplier ? supplier.name : undefined}
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
      <div className="space-y-4">
        <Field
          label={t('suppliers.paymentAmount')}
          required
          error={error}
          hint={supplier ? `${t('suppliers.balance')}: ${money(supplier.balance)}` : undefined}
        >
          <input
            className="input"
            dir="ltr"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function Suppliers() {
  const { t, money, moneyShort, num } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const { suppliers, purchases, products, deleteSupplier } = useData();

  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [paying, setPaying] = useState<Supplier | null>(null);

  const canManage = hasPermission('suppliers.manage');

  const purchaseCountBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    purchases.forEach((purchase) =>
      map.set(purchase.supplierId, (map.get(purchase.supplierId) ?? 0) + 1),
    );
    return map;
  }, [purchases]);

  const productCountBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((product) => {
      if (!product.supplierId) return;
      map.set(product.supplierId, (map.get(product.supplierId) ?? 0) + 1);
    });
    return map;
  }, [products]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return suppliers
      .filter((supplier) => {
        if (!term) return true;
        return [supplier.name, supplier.phone, supplier.code]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [suppliers, query]);

  const stats = useMemo(
    () => ({
      total: suppliers.length,
      totalPayables: payables(purchases),
      withBalance: suppliers.filter((supplier) => supplier.balance > 0).length,
    }),
    [suppliers, purchases],
  );

  const handleDelete = async (supplier: Supplier) => {
    const ok = await confirm({ message: t('common.deleteConfirmBody') });
    if (!ok) return;
    deleteSupplier(supplier.id);
    toast.success(t('suppliers.deleted'));
  };

  const exportCsv = () =>
    downloadCsv(
      'suppliers.csv',
      rows.map((supplier) => ({
        code: supplier.code,
        name: supplier.name,
        contactPerson: supplier.contactPerson ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        taxNumber: supplier.taxNumber ?? '',
        purchases: purchaseCountBySupplier.get(supplier.id) ?? 0,
        balance: supplier.balance,
      })),
    );

  const columns: Array<Column<Supplier>> = [
    {
      key: 'code',
      header: t('suppliers.code'),
      render: (supplier) => (
        <span className="font-mono text-[11px] text-slate-500" dir="ltr">
          {supplier.code}
        </span>
      ),
      sortValue: (supplier) => supplier.code,
    },
    {
      key: 'name',
      header: t('suppliers.name'),
      render: (supplier) => (
        <span>
          <span className="block font-semibold text-slate-800">{supplier.name}</span>
          {supplier.contactPerson && (
            <span className="block text-xs text-slate-400">{supplier.contactPerson}</span>
          )}
        </span>
      ),
      sortValue: (supplier) => supplier.name,
    },
    {
      key: 'phone',
      header: t('common.phone'),
      render: (supplier) => (
        <span className="tabular-nums text-slate-600" dir="ltr">
          {supplier.phone ?? '—'}
        </span>
      ),
    },
    {
      key: 'address',
      header: t('common.address'),
      render: (supplier) => <span className="text-slate-500">{supplier.address ?? '—'}</span>,
    },
    {
      key: 'taxNumber',
      header: t('suppliers.taxNumber'),
      render: (supplier) => (
        <span className="font-mono text-[11px] text-slate-500" dir="ltr">
          {supplier.taxNumber ?? '—'}
        </span>
      ),
    },
    {
      key: 'purchases',
      header: t('suppliers.purchaseCount'),
      align: 'center',
      render: (supplier) => {
        const productCount = productCountBySupplier.get(supplier.id) ?? 0;
        return (
          <span>
            <span className="tabular-nums text-slate-700">
              {num(purchaseCountBySupplier.get(supplier.id) ?? 0)}
            </span>
            {productCount > 0 && (
              <span className="block text-[11px] text-slate-400">
                {num(productCount)} {t('products.title')}
              </span>
            )}
          </span>
        );
      },
      sortValue: (supplier) => purchaseCountBySupplier.get(supplier.id) ?? 0,
    },
    {
      key: 'balance',
      header: t('suppliers.balance'),
      align: 'end',
      render: (supplier) => (
        <span
          className={`font-bold tabular-nums ${
            supplier.balance > 0 ? 'text-rose-600' : supplier.balance < 0 ? 'text-emerald-600' : 'text-slate-500'
          }`}
        >
          {money(supplier.balance)}
        </span>
      ),
      sortValue: (supplier) => supplier.balance,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (supplier) => (
        <div className="flex justify-end gap-1">
          {canManage && (
            <>
              <button
                type="button"
                className="btn-icon"
                title={t('common.edit')}
                onClick={() => {
                  setEditing(supplier);
                  setFormOpen(true);
                }}
              >
                ✏️
              </button>
              <button
                type="button"
                className="btn-icon"
                title={t('suppliers.paySupplier')}
                onClick={() => setPaying(supplier)}
              >
                💵
              </button>
              <button
                type="button"
                className="btn-icon hover:bg-rose-50 hover:text-rose-600"
                title={t('common.delete')}
                onClick={() => handleDelete(supplier)}
              >
                🗑️
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('suppliers.title')}
        subtitle={t('suppliers.subtitle')}
        actions={
          canManage && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              ➕ {t('suppliers.new')}
            </button>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t('suppliers.title')} value={num(stats.total)} tone="brand" icon="🚚" />
        <StatCard
          label={t('dashboard.payables')}
          value={moneyShort(stats.totalPayables)}
          tone="red"
          icon="💸"
        />
        <StatCard
          label={t('suppliers.balance')}
          value={num(stats.withBalance)}
          tone="amber"
          icon="⏳"
          hint={t('common.due')}
        />
      </div>

      <Toolbar>
        <SearchInput
          className="w-full sm:max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={t('suppliers.searchPlaceholder')}
        />
        <button type="button" className="btn-secondary" onClick={exportCsv}>
          ⬇️ {t('common.exportCsv')}
        </button>
        <span className="ms-auto text-sm text-slate-500">
          {num(rows.length)} {t('common.of')} {num(suppliers.length)}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(supplier) => supplier.id}
        pageSize={25}
        empty={<p className="px-5 py-10 text-center text-sm text-slate-400">{t('suppliers.noSuppliers')}</p>}
      />

      <SupplierFormModal open={formOpen} onClose={() => setFormOpen(false)} supplier={editing} />
      <SupplierPaymentModal supplier={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
