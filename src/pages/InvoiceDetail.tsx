import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n } from '@/i18n';
import { Badge, Field, Modal, PageHeader } from '@/components/ui';
import { useConfirm, useToast } from '@/components/feedback';
import { invoiceDue, lineTotal, refundableAmount } from '@/lib/calc';
import { NotFound } from '@/pages/NotFound';
import type { PaymentMethod } from '@/types';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'insurance', 'credit'];

const STATUS_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'red',
  returned: 'violet',
  cancelled: 'gray',
} as const;

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { t, pick, money, num, date, dateTime, diopter } = useI18n();
  const { hasPermission } = useAuth();
  const {
    invoiceById,
    customerById,
    labOrderById,
    prescriptionById,
    returns,
    settings,
    addPayment,
    cancelInvoice,
    deleteInvoice,
  } = useData();

  const invoice = invoiceById(id);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentNote, setPaymentNote] = useState('');

  const autoPrint = searchParams.get('print') === '1';
  useEffect(() => {
    if (autoPrint && invoice) {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [autoPrint, invoice]);

  const invoiceReturns = useMemo(
    () => (invoice ? returns.filter((item) => item.invoiceId === invoice.id) : []),
    [returns, invoice],
  );

  if (!invoice) return <NotFound />;

  const customer = customerById(invoice.customerId);
  const labOrder = labOrderById(invoice.labOrderId);
  const prescription = prescriptionById(invoice.prescriptionId);
  const due = invoiceDue(invoice);

  const submitPayment = () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('validation.positiveNumber'));
      return;
    }
    if (amount > due + 0.01) {
      toast.error(t('validation.amountExceedsDue'));
      return;
    }
    addPayment(invoice.id, { amount, method: paymentMethod, note: paymentNote.trim() || undefined });
    toast.success(t('invoices.paymentAdded'));
    setPaymentOpen(false);
  };

  const handleCancel = async () => {
    const ok = await confirm({ message: t('invoices.deleteConfirm'), confirmLabel: t('invoices.markCancelled') });
    if (!ok) return;
    cancelInvoice(invoice.id);
    toast.success(t('common.saved'));
  };

  const handleDelete = async () => {
    const ok = await confirm({ message: t('invoices.deleteConfirm') });
    if (!ok) return;
    deleteInvoice(invoice.id);
    toast.success(t('invoices.deleted'));
    navigate('/invoices');
  };

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title={`${t('invoices.invoice')} ${invoice.number}`}
          subtitle={dateTime(invoice.createdAt)}
          actions={
            <>
              <button type="button" className="btn-ghost btn-sm" onClick={() => navigate('/invoices')}>
                → {t('invoices.title')}
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
                🖨️ {t('invoices.print')}
              </button>
              {due > 0 && invoice.status !== 'cancelled' && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setPaymentAmount(String(due));
                    setPaymentMethod(invoice.paymentMethod);
                    setPaymentNote('');
                    setPaymentOpen(true);
                  }}
                >
                  💵 {t('invoices.addPayment')}
                </button>
              )}
              {hasPermission('returns.manage') && refundableAmount(invoice) > 0 && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => navigate(`/returns?invoice=${invoice.id}`)}
                >
                  ↩️ {t('invoices.return')}
                </button>
              )}
              {hasPermission('invoices.edit') && invoice.status !== 'cancelled' && (
                <button type="button" className="btn-warn btn-sm" onClick={handleCancel}>
                  🚫 {t('invoices.markCancelled')}
                </button>
              )}
              {hasPermission('invoices.delete') && (
                <button type="button" className="btn-danger btn-sm" onClick={handleDelete}>
                  🗑️ {t('common.delete')}
                </button>
              )}
            </>
          }
        />
      </div>

      <div className="print-area card card-pad">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-start gap-3">
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="" className="h-14 w-14 rounded-xl object-contain" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-700 text-2xl text-white">
                🕶️
              </span>
            )}
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">
                {pick(settings.storeNameAr, settings.storeNameEn)}
              </h1>
              <p className="text-xs text-slate-500">{pick(settings.addressAr, settings.addressEn)}</p>
              <p className="text-xs text-slate-500" dir="ltr">
                {settings.phone} · {settings.email}
              </p>
              <p className="text-xs text-slate-500" dir="ltr">
                {t('settings.taxNumber')}: {settings.taxNumber} · {t('settings.crNumber')}: {settings.crNumber}
              </p>
            </div>
          </div>

          <div className="text-end">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{t('invoices.taxInvoice')}</p>
            <p className="text-2xl font-extrabold text-brand-800">{invoice.number}</p>
            <p className="text-xs text-slate-500">{date(invoice.createdAt)}</p>
            <div className="mt-1 flex justify-end">
              <Badge tone={STATUS_TONE[invoice.status]}>
                {t(`invoices.status.${invoice.status}` as 'invoices.status.paid')}
              </Badge>
            </div>
          </div>
        </header>

        <section className="grid gap-4 py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('invoices.customer')}</p>
            <p className="text-sm font-bold text-slate-800">{invoice.customerName}</p>
            {invoice.customerPhone && (
              <p className="text-xs text-slate-500" dir="ltr">
                {invoice.customerPhone}
              </p>
            )}
            {customer?.address && <p className="text-xs text-slate-500">{customer.address}</p>}
            {invoice.insuranceCompany && (
              <p className="mt-1 text-xs text-slate-500">
                {t('customers.insuranceCompany')}: {invoice.insuranceCompany}
              </p>
            )}
          </div>
          <div className="sm:text-end">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('invoices.byUser')}</p>
            <p className="text-sm font-semibold text-slate-700">{invoice.userName}</p>
            <p className="mt-1 text-xs text-slate-500">
              {t('common.method')}: {t(`pos.method.${invoice.paymentMethod}` as 'pos.method.cash')}
            </p>
            {prescription && (
              <p className="text-xs text-slate-500">
                {t('prescriptions.number')}: {prescription.number}
              </p>
            )}
            {labOrder && (
              <p className="text-xs text-slate-500">
                {t('lab.number')}: {labOrder.number} · {t(`lab.status.${labOrder.status}` as 'lab.status.draft')}
              </p>
            )}
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="table table-compact min-w-[640px]">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>{t('common.description')}</th>
                <th className="text-center">{t('common.quantity')}</th>
                <th className="text-end">{t('common.unitPrice')}</th>
                <th className="text-end">{t('common.discount')}</th>
                <th className="text-end">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="text-slate-400">{num(index + 1)}</td>
                  <td>
                    <span className="block font-semibold text-slate-800">{pick(item.nameAr, item.nameEn)}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{item.sku}</span>
                    {item.lensOptions && (
                      <span className="block text-[11px] text-brand-700">
                        {item.lensOptions.index ? `Index ${item.lensOptions.index}` : ''}{' '}
                        {(item.lensOptions.coating ?? []).join(' · ')}
                        {item.lensOptions.tint ? ` · ${item.lensOptions.tint}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="text-center tabular-nums">{num(item.quantity)}</td>
                  <td className="text-end tabular-nums">{money(item.unitPrice)}</td>
                  <td className="text-end tabular-nums text-slate-500">
                    {item.discount > 0 ? money(item.discount) : '—'}
                  </td>
                  <td className="text-end font-bold tabular-nums">{money(lineTotal(item))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="grid gap-6 py-4 sm:grid-cols-2">
          <div className="space-y-2 text-xs text-slate-500">
            {prescription && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-1 text-sm font-bold text-slate-700">{t('prescriptions.refractionTable')}</p>
                <p dir="ltr" className="font-mono">
                  OD: {diopter(prescription.od.sph)} / {diopter(prescription.od.cyl)} ×{' '}
                  {prescription.od.axis ?? '—'}
                </p>
                <p dir="ltr" className="font-mono">
                  OS: {diopter(prescription.os.sph)} / {diopter(prescription.os.cyl)} ×{' '}
                  {prescription.os.axis ?? '—'}
                </p>
                <p dir="ltr">PD: {prescription.pd ?? '—'}</p>
              </div>
            )}
            {invoice.notes && <p>{invoice.notes}</p>}
            {invoiceReturns.length > 0 && (
              <div>
                <p className="font-bold text-slate-600">{t('returns.title')}</p>
                {invoiceReturns.map((record) => (
                  <p key={record.id}>
                    {record.number} · {date(record.date)} · {money(record.amount)}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t('common.subtotal')}</span>
              <span className="tabular-nums">{money(invoice.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t('common.discount')}</span>
              <span className="tabular-nums">-{money(invoice.discount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                {t('common.vat')} ({num(invoice.taxRate)}%)
              </span>
              <span className="tabular-nums">{money(invoice.taxAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base">
              <span className="font-bold text-slate-700">{t('common.grandTotal')}</span>
              <span className="font-extrabold tabular-nums text-brand-800">{money(invoice.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t('common.paid')}</span>
              <span className="tabular-nums text-emerald-600">{money(invoice.paid)}</span>
            </div>
            {invoice.refunded > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('invoices.refundAmount')}</span>
                <span className="tabular-nums text-rose-600">-{money(invoice.refunded)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="font-bold text-slate-700">{t('common.due')}</span>
              <span className={`font-bold tabular-nums ${due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {money(due)}
              </span>
            </div>
          </div>
        </section>

        {invoice.payments.length > 0 && (
          <section className="border-t border-slate-200 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {t('invoices.paymentHistory')}
            </p>
            <ul className="space-y-1 text-xs text-slate-600">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3">
                  <span>
                    {dateTime(payment.date)} · {t(`pos.method.${payment.method}` as 'pos.method.cash')}
                    {payment.note ? ` · ${payment.note}` : ''}
                  </span>
                  <span className="font-bold tabular-nums">{money(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-4 border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
          <p>{pick(settings.invoiceFooterAr, settings.invoiceFooterEn)}</p>
          <p className="mt-1 font-bold text-slate-600">{t('invoices.thankYou')}</p>
        </footer>


      </div>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        size="sm"
        title={t('invoices.newPayment')}
        subtitle={invoice.number}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPaymentOpen(false)}>
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
            {t('common.due')}: <span className="font-bold text-rose-600">{money(due)}</span>
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
            <input className="input" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
          </Field>
        </div>
      </Modal>

    </div>
  );
}

