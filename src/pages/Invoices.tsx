import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { invoiceDue, receivables, sumBy } from '@/lib/calc';
import { inRange, periodRange, type PeriodKey } from '@/lib/date';
import { downloadCsv } from '@/store/db';
import type { Invoice, PaymentMethod } from '@/types';

const STATUS_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'red',
  returned: 'violet',
  cancelled: 'gray',
} as const;

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'insurance', 'credit'];

const PERIODS: PeriodKey[] = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear', 'all'];

export function Invoices() {
  const { t, money, moneyShort, num, date } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const { invoices, addPayment, cancelInvoice, deleteInvoice, returns } = useData();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Invoice['status']>('all');
  const [method, setMethod] = useState<'all' | PaymentMethod>('all');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentNote, setPaymentNote] = useState('');

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const range = periodRange(period);
    return invoices
      .filter((invoice) => {
        const matchesTerm =
          !term ||
          [invoice.number, invoice.customerName, invoice.customerPhone]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term));
        const matchesStatus = status === 'all' || invoice.status === status;
        const matchesMethod = method === 'all' || invoice.paymentMethod === method;
        return matchesTerm && matchesStatus && matchesMethod && inRange(invoice.createdAt, range);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices, query, status, method, period]);

  const stats = useMemo(() => {
    const active = invoices.filter((invoice) => invoice.status !== 'cancelled');
    return {
      total: sumBy(active, (invoice) => invoice.total - invoice.refunded),
      collected: sumBy(active, (invoice) => invoice.paid - invoice.refunded),
      due: receivables(invoices),
      refunded: sumBy(returns, (item) => item.amount),
      count: active.length,
      average: active.length > 0 ? sumBy(active, (invoice) => invoice.total) / active.length : 0,
    };
  }, [invoices, returns]);

  const openPayment = (invoice: Invoice) => {
    setPaymentInvoice(invoice);
    setPaymentAmount(String(invoiceDue(invoice)));
    setPaymentMethod(invoice.paymentMethod);
    setPaymentNote('');
  };

  const submitPayment = () => {
    if (!paymentInvoice) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('validation.positiveNumber'));
      return;
    }
    addPayment(paymentInvoice.id, { amount, method: paymentMethod, note: paymentNote.trim() || undefined });
    toast.success(t('invoices.paymentAdded'));
    setPaymentInvoice(null);
  };

  const handleCancel = async (invoice: Invoice) => {
    const ok = await confirm({
      message: t('invoices.deleteConfirm'),
      confirmLabel: t('invoices.markCancelled'),
    });
    if (!ok) return;
    cancelInvoice(invoice.id);
    toast.success(t('common.saved'));
  };

  const handleDelete = async (invoice: Invoice) => {
    const ok = await confirm({ message: t('invoices.deleteConfirm') });
    if (!ok) return;
    deleteInvoice(invoice.id);
    toast.success(t('invoices.deleted'));
  };

  const exportCsv = () =>
    downloadCsv(
      'invoices.csv',
      rows.map((invoice) => ({
        number: invoice.number,
        date: invoice.createdAt,
        customer: invoice.customerName,
        phone: invoice.customerPhone ?? '',
        items: invoice.items.length,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.taxAmount,
        total: invoice.total,
        paid: invoice.paid,
        due: invoiceDue(invoice),
        refunded: invoice.refunded,
        status: invoice.status,
        method: invoice.paymentMethod,
        seller: invoice.userName,
      })),
    );

  const columns: Array<Column<Invoice>> = [
    {
      key: 'number',
      header: t('invoices.number'),
      render: (invoice) => (
        <Link to={`/invoices/${invoice.id}`} className="link">
          {invoice.number}
        </Link>
      ),
      sortValue: (invoice) => invoice.number,
    },
    {
      key: 'date',
      header: t('invoices.date'),
      render: (invoice) => (
        <span className="text-xs text-slate-500">
          {date(invoice.createdAt)}
        </span>
      ),
      sortValue: (invoice) => invoice.createdAt,
    },
    {
      key: 'customer',
      header: t('invoices.customer'),
      render: (invoice) => (
        <span>
          <span className="block font-semibold text-slate-700">{invoice.customerName}</span>
          {invoice.customerPhone && (
            <span className="block text-[11px] text-slate-400" dir="ltr">
              {invoice.customerPhone}
            </span>
          )}
        </span>
      ),
      sortValue: (invoice) => invoice.customerName,
    },
    {
      key: 'items',
      header: t('invoices.items'),
      align: 'center',
      render: (invoice) => <span className="tabular-nums">{num(invoice.items.length)}</span>,
    },
    {
      key: 'total',
      header: t('common.total'),
      align: 'end',
      render: (invoice) => <span className="font-bold tabular-nums">{money(invoice.total)}</span>,
      sortValue: (invoice) => invoice.total,
    },
    {
      key: 'paid',
      header: t('common.paid'),
      align: 'end',
      render: (invoice) => <span className="tabular-nums text-emerald-600">{money(invoice.paid)}</span>,
      sortValue: (invoice) => invoice.paid,
    },
    {
      key: 'due',
      header: t('common.due'),
      align: 'end',
      render: (invoice) => {
        const due = invoiceDue(invoice);
        return due > 0 ? (
          <span className="font-bold tabular-nums text-rose-600">{money(due)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      },
      sortValue: (invoice) => invoiceDue(invoice),
    },
    {
      key: 'method',
      header: t('common.method'),
      align: 'center',
      render: (invoice) => (
        <Badge tone="gray">{t(`pos.method.${invoice.paymentMethod}` as 'pos.method.cash')}</Badge>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      align: 'center',
      render: (invoice) => (
        <Badge tone={STATUS_TONE[invoice.status]}>
          {t(`invoices.status.${invoice.status}` as 'invoices.status.paid')}
        </Badge>
      ),
    },
    {
      key: 'seller',
      header: t('invoices.byUser'),
      render: (invoice) => <span className="text-xs text-slate-500">{invoice.userName}</span>,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (invoice) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="btn-icon"
            title={t('invoices.view')}
            onClick={() => navigate(`/invoices/${invoice.id}`)}
          >
            👁️
          </button>
          {invoiceDue(invoice) > 0 && invoice.status !== 'cancelled' && (
            <button type="button" className="btn-icon" title={t('invoices.addPayment')} onClick={() => openPayment(invoice)}>
              💵
            </button>
          )}
          {hasPermission('returns.manage') && invoice.refunded < invoice.total && invoice.status !== 'cancelled' && (
            <button
              type="button"
              className="btn-icon"
              title={t('invoices.return')}
              onClick={() => navigate(`/returns?invoice=${invoice.id}`)}
            >
              ↩️
            </button>
          )}
          {hasPermission('invoices.edit') && invoice.status !== 'cancelled' && (
            <button
              type="button"
              className="btn-icon"
              title={t('invoices.markCancelled')}
              onClick={() => handleCancel(invoice)}
            >
              🚫
            </button>
          )}
          {hasPermission('invoices.delete') && (
            <button
              type="button"
              className="btn-icon hover:bg-rose-50 hover:text-rose-600"
              title={t('common.delete')}
              onClick={() => handleDelete(invoice)}
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
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={exportCsv}>
              ⬇️ {t('common.exportCsv')}
            </button>
            {hasPermission('pos.use') && (
              <button type="button" className="btn-primary" onClick={() => navigate('/pos')}>
                🛒 {t('nav.pos')}
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('invoices.totalSales')}
          value={moneyShort(stats.total)}
          tone="brand"
          icon="🧾"
          hint={`${t('reports.invoiceCount')}: ${num(stats.count)}`}
        />
        <StatCard label={t('invoices.collected')} value={moneyShort(stats.collected)} tone="green" icon="💰" />
        <StatCard label={t('invoices.outstanding')} value={moneyShort(stats.due)} tone="red" icon="⏳" />
        <StatCard
          label={t('reports.avgInvoice')}
          value={money(stats.average)}
          tone="violet"
          icon="📊"
          hint={`${t('reports.refunds')}: ${moneyShort(stats.refunded)}`}
        />
      </div>

      <Toolbar>
        <SearchInput
          className="w-full sm:max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={t('invoices.searchPlaceholder')}
        />
        <select
          className="select w-auto"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="all">
            {t('common.status')}: {t('common.all')}
          </option>
          {(['paid', 'partial', 'pending', 'returned', 'cancelled'] as const).map((item) => (
            <option key={item} value={item}>
              {t(`invoices.status.${item}` as 'invoices.status.paid')}
            </option>
          ))}
        </select>
        <select
          className="select w-auto"
          value={method}
          onChange={(event) => setMethod(event.target.value as typeof method)}
        >
          <option value="all">
            {t('common.method')}: {t('common.all')}
          </option>
          {PAYMENT_METHODS.map((item) => (
            <option key={item} value={item}>
              {t(`pos.method.${item}` as 'pos.method.cash')}
            </option>
          ))}
        </select>
        <select
          className="select w-auto"
          value={period}
          onChange={(event) => setPeriod(event.target.value as PeriodKey)}
        >
          {PERIODS.map((item) => (
            <option key={item} value={item}>
              {t(`reports.period.${item}` as 'reports.period.today')}
            </option>
          ))}
        </select>
        <span className="ms-auto text-sm text-slate-500">
          {num(rows.length)} {t('common.of')} {num(invoices.length)}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(invoice) => invoice.id}
        pageSize={25}
        empty={<p className="px-5 py-10 text-center text-sm text-slate-400">{t('invoices.noInvoices')}</p>}
      />

      <Modal
        open={Boolean(paymentInvoice)}
        onClose={() => setPaymentInvoice(null)}
        size="sm"
        title={t('invoices.newPayment')}
        subtitle={paymentInvoice?.number}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPaymentInvoice(null)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={submitPayment}>
              {t('common.save')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t('common.due')}:{' '}
            <span className="font-bold text-rose-600">
              {paymentInvoice ? money(invoiceDue(paymentInvoice)) : '—'}
            </span>
          </p>
          <Field label={t('common.amount')} required>
            <input
              className="input"
              dir="ltr"
              type="number"
              step={0.01}
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
            />
          </Field>
          <Field label={t('common.method')}>
            <select
              className="select"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>
                  {t(`pos.method.${item}` as 'pos.method.cash')}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('common.notes')}>
            <input
              className="input"
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
