import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n } from '@/i18n';
import { Badge, DataTable, PageHeader, SearchInput, StatCard, Toolbar, type Column } from '@/components/ui';
import { useConfirm, useToast } from '@/components/feedback';
import { CustomerFormModal } from '@/components/CustomerFormModal';
import { customerSales, receivables } from '@/lib/calc';
import { downloadCsv } from '@/store/db';
import { isSameMonth } from '@/lib/date';
import type { Customer } from '@/types';

export function Customers() {
  const { t, money, moneyShort, num } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const { customers, invoices, deleteCustomer, prescriptions } = useData();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'spent' | 'due'>('recent');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const salesByCustomer = useMemo(
    () => new Map(customerSales(invoices).map((row) => [row.customerId, row])),
    [invoices],
  );

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = customers.filter((customer) => {
      if (!term) return true;
      return [customer.name, customer.nameEn, customer.phone, customer.altPhone, customer.code, customer.city]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });

    return filtered.slice().sort((a, b) => {
      const statsA = salesByCustomer.get(a.id);
      const statsB = salesByCustomer.get(b.id);
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name, 'ar');
        case 'spent':
          return (statsB?.revenue ?? 0) - (statsA?.revenue ?? 0);
        case 'due':
          return (statsB?.due ?? 0) - (statsA?.due ?? 0);
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [customers, query, sort, salesByCustomer]);

  const stats = useMemo(
    () => ({
      total: customers.length,
      newThisMonth: customers.filter((customer) => isSameMonth(customer.createdAt, new Date())).length,
      withDebt: customers.filter((customer) => (salesByCustomer.get(customer.id)?.due ?? 0) > 0).length,
      totalDue: receivables(invoices),
    }),
    [customers, invoices, salesByCustomer],
  );

  const handleDelete = async (customer: Customer) => {
    const ok = await confirm({ message: t('customers.deleteConfirm') });
    if (!ok) return;
    deleteCustomer(customer.id);
    toast.success(t('common.deleted'));
  };

  const exportCsv = () => {
    downloadCsv(
      'customers.csv',
      rows.map((customer) => ({
        code: customer.code,
        name: customer.name,
        nameEn: customer.nameEn ?? '',
        phone: customer.phone,
        city: customer.city ?? '',
        visits: salesByCustomer.get(customer.id)?.invoiceCount ?? 0,
        totalSpent: salesByCustomer.get(customer.id)?.revenue ?? 0,
        due: salesByCustomer.get(customer.id)?.due ?? 0,
        loyaltyPoints: customer.loyaltyPoints,
      })),
    );
  };

  const columns: Array<Column<Customer>> = [
    {
      key: 'code',
      header: t('customers.code'),
      render: (customer) => <span className="font-mono text-xs text-slate-500">{customer.code}</span>,
      sortValue: (customer) => customer.code,
    },
    {
      key: 'name',
      header: t('customers.name'),
      render: (customer) => (
        <span>
          <span className="block font-semibold text-slate-800">{customer.name}</span>
          {customer.nameEn && <span className="block text-xs text-slate-400">{customer.nameEn}</span>}
        </span>
      ),
      sortValue: (customer) => customer.name,
    },
    {
      key: 'phone',
      header: t('common.phone'),
      render: (customer) => (
        <span dir="ltr" className="text-slate-600">
          {customer.phone}
        </span>
      ),
    },
    {
      key: 'city',
      header: t('customers.city'),
      render: (customer) => <span className="text-slate-500">{customer.city ?? '—'}</span>,
    },
    {
      key: 'prescriptions',
      header: t('customers.prescriptionsCount'),
      align: 'center',
      render: (customer) => (
        <Badge tone="blue">{num(prescriptions.filter((item) => item.customerId === customer.id).length)}</Badge>
      ),
    },
    {
      key: 'visits',
      header: t('customers.visits'),
      align: 'center',
      render: (customer) => (
        <span className="tabular-nums">{num(salesByCustomer.get(customer.id)?.invoiceCount ?? 0)}</span>
      ),
      sortValue: (customer) => salesByCustomer.get(customer.id)?.invoiceCount ?? 0,
    },
    {
      key: 'spent',
      header: t('customers.totalSpent'),
      align: 'end',
      render: (customer) => (
        <span className="font-bold tabular-nums">{money(salesByCustomer.get(customer.id)?.revenue ?? 0)}</span>
      ),
      sortValue: (customer) => salesByCustomer.get(customer.id)?.revenue ?? 0,
    },
    {
      key: 'due',
      header: t('customers.balanceDue'),
      align: 'end',
      render: (customer) => {
        const due = salesByCustomer.get(customer.id)?.due ?? 0;
        return due > 0 ? (
          <span className="font-bold tabular-nums text-rose-600">{money(due)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      },
      sortValue: (customer) => salesByCustomer.get(customer.id)?.due ?? 0,
    },
    {
      key: 'loyalty',
      header: t('customers.loyaltyPoints'),
      align: 'center',
      render: (customer) => <Badge tone="amber">{num(customer.loyaltyPoints)}</Badge>,
      sortValue: (customer) => customer.loyaltyPoints,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (customer) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="btn-icon"
            title={t('common.edit')}
            onClick={() => {
              setEditing(customer);
              setFormOpen(true);
            }}
          >
            ✏️
          </button>
          {hasPermission('customers.manage') && (
            <button
              type="button"
              className="btn-icon hover:bg-rose-50 hover:text-rose-600"
              title={t('common.delete')}
              onClick={() => handleDelete(customer)}
            >
              🗑️
            </button>
          )}
        </div>
      ),
    },
  ];


  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={exportCsv}>
              ⬇️ {t('common.exportCsv')}
            </button>
            {hasPermission('customers.manage') && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                ➕ {t('customers.new')}
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('dashboard.totalCustomers')} value={num(stats.total)} tone="brand" icon="👥" />
        <StatCard label={t('customers.newThisMonth')} value={num(stats.newThisMonth)} tone="green" icon="🆕" />
        <StatCard label={t('customers.withDebt')} value={num(stats.withDebt)} tone="amber" icon="⏳" />
        <StatCard label={t('customers.outstanding')} value={moneyShort(stats.totalDue)} tone="red" icon="🧾" />
      </div>

      <Toolbar>
        <SearchInput
          className="w-full sm:max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={t('customers.searchPlaceholder')}
        />
        <select className="select w-auto" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
          <option value="recent">{t('common.date')}</option>
          <option value="name">{t('customers.name')}</option>
          <option value="spent">{t('customers.totalSpent')}</option>
          <option value="due">{t('customers.balanceDue')}</option>
        </select>
        <span className="ms-auto text-sm text-slate-500">
          {num(rows.length)} {t('common.of')} {num(customers.length)}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(customer) => customer.id}
        pageSize={25}
        onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
        empty={<p className="px-5 py-10 text-center text-sm text-slate-400">{t('customers.noCustomers')}</p>}
      />

      <CustomerFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customer={editing}
        onCreated={(customer) => navigate(`/customers/${customer.id}`)}
      />
    </div>
  );
}

