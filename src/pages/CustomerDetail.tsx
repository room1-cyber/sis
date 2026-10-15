import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n } from '@/i18n';
import { Badge, Card, DataTable, EmptyState, StatCard, Tabs, type Column } from '@/components/ui';
import { useConfirm, useToast } from '@/components/feedback';
import { CustomerFormModal } from '@/components/CustomerFormModal';
import { PrescriptionFormModal } from '@/components/PrescriptionFormModal';
import { NotFound } from '@/pages/NotFound';
import { invoiceDue } from '@/lib/calc';
import { ageFrom, toDateInput } from '@/lib/date';
import { LAB_STATUS_TONE } from '@/pages/labOrderMeta';
import type { Appointment, Invoice, LabOrder, Prescription } from '@/types';

type TabKey = 'invoices' | 'prescriptions' | 'appointments' | 'labOrders';

const INVOICE_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'red',
  returned: 'violet',
  cancelled: 'gray',
} as const;

const APPOINTMENT_TONE = {
  scheduled: 'blue',
  confirmed: 'brand',
  completed: 'green',
  cancelled: 'gray',
  no_show: 'red',
} as const;

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, pick, money, num, date, diopter } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const {
    customerById,
    invoicesOf,
    prescriptionsOf,
    appointmentsOf,
    labOrdersOf,
    deleteCustomer,
    deletePrescription,
  } = useData();

  const customer = customerById(id);
  const [tab, setTab] = useState<TabKey>('invoices');
  const [editOpen, setEditOpen] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);
  const [editingRx, setEditingRx] = useState<Prescription | null>(null);

  const invoices = useMemo(() => invoicesOf(id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [invoicesOf, id]);
  const prescriptions = useMemo(
    () => prescriptionsOf(id).slice().sort((a, b) => b.date.localeCompare(a.date)),
    [prescriptionsOf, id],
  );
  const appointments = useMemo(
    () => appointmentsOf(id).slice().sort((a, b) => b.date.localeCompare(a.date)),
    [appointmentsOf, id],
  );
  const labOrders = useMemo(
    () => labOrdersOf(id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [labOrdersOf, id],
  );

  const totals = useMemo(
    () => ({
      spent: invoices.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.total, 0),
      due: invoices.reduce((sum, item) => sum + invoiceDue(item), 0),
      visits: invoices.length,
      lastVisit: invoices[0]?.createdAt,
    }),
    [invoices],
  );

  if (!customer) return <NotFound />;

  const handleDelete = async () => {
    const ok = await confirm({ message: t('customers.deleteConfirm') });
    if (!ok) return;
    deleteCustomer(customer.id);
    toast.success(t('common.deleted'));
    navigate('/customers');
  };

  const handleDeleteRx = async (prescription: Prescription) => {
    const ok = await confirm({ message: t('common.deleteConfirmBody') });
    if (!ok) return;
    deletePrescription(prescription.id);
    toast.success(t('prescriptions.deleted'));
  };

  const invoiceColumns: Array<Column<Invoice>> = [
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
      header: t('common.date'),
      render: (invoice) => <span className="text-xs text-slate-500">{date(invoice.createdAt)}</span>,
      sortValue: (invoice) => invoice.createdAt,
    },
    {
      key: 'items',
      header: t('invoices.items'),
      render: (invoice) => <span className="text-xs text-slate-500">{num(invoice.items.length)}</span>,
    },
    {
      key: 'total',
      header: t('common.total'),
      align: 'end',
      render: (invoice) => <span className="font-bold tabular-nums">{money(invoice.total)}</span>,
      sortValue: (invoice) => invoice.total,
    },
    {
      key: 'due',
      header: t('common.due'),
      align: 'end',
      render: (invoice) =>
        invoiceDue(invoice) > 0 ? (
          <span className="font-bold tabular-nums text-rose-600">{money(invoiceDue(invoice))}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
      sortValue: (invoice) => invoiceDue(invoice),
    },
    {
      key: 'status',
      header: t('common.status'),
      align: 'center',
      render: (invoice) => (
        <Badge tone={INVOICE_TONE[invoice.status]}>
          {t(`invoices.status.${invoice.status}` as 'invoices.status.paid')}
        </Badge>
      ),
    },
  ];

  const age = ageFrom(customer.birthDate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="btn-ghost btn-sm" onClick={() => navigate('/customers')}>
          → {t('customers.title')}
        </button>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-500">{customer.code}</span>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-2xl font-bold text-white">
              {customer.name.slice(0, 1)}
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">{customer.name}</h1>
              {customer.nameEn && <p className="text-sm text-slate-500">{customer.nameEn}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="brand">{customer.code}</Badge>
                {customer.gender && (
                  <Badge tone="blue">{t(`customers.${customer.gender}` as 'customers.male')}</Badge>
                )}
                {age !== null && (
                  <Badge tone="gray">
                    {num(age)} {t('customers.years')}
                  </Badge>
                )}
                {customer.city && <Badge tone="gray">{customer.city}</Badge>}
                {customer.insuranceCompany && <Badge tone="violet">{customer.insuranceCompany}</Badge>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPermission('prescriptions.manage') && (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => {
                  setEditingRx(null);
                  setRxOpen(true);
                }}
              >
                👁️ {t('customers.addPrescription')}
              </button>
            )}
            {hasPermission('pos.use') && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/pos')}>
                🛒 {t('nav.pos')}
              </button>
            )}
            {hasPermission('customers.manage') && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setEditOpen(true)}>
                ✏️ {t('common.edit')}
              </button>
            )}
            {hasPermission('customers.manage') && (
              <button type="button" className="btn-danger btn-sm" onClick={handleDelete}>
                🗑️ {t('common.delete')}
              </button>
            )}
          </div>
        </div>

        <div className="divider" />

        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t('common.phone'), value: customer.phone, ltr: true },
            { label: t('customers.altPhone'), value: customer.altPhone, ltr: true },
            { label: t('common.email'), value: customer.email, ltr: true },
            {
              label: t('customers.birthDate'),
              value: customer.birthDate ? toDateInput(customer.birthDate) : '—',
              ltr: true,
            },
            { label: t('customers.address'), value: customer.address, ltr: false },
            { label: t('customers.occupation'), value: customer.occupation, ltr: false },
            { label: t('customers.insuranceNumber'), value: customer.insuranceNumber, ltr: true },
            { label: t('common.createdAt'), value: date(customer.createdAt), ltr: false },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{row.label}</dt>
              <dd className="mt-0.5 font-semibold text-slate-700" dir={row.ltr ? 'ltr' : undefined}>
                {row.value || '—'}
              </dd>
            </div>
          ))}
        </dl>

        {customer.notes && (
          <>
            <div className="divider" />
            <p className="text-sm text-slate-600">{customer.notes}</p>
          </>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={t('customers.totalSpent')} value={money(totals.spent)} tone="green" icon="💰" />
        <StatCard label={t('customers.visits')} value={num(totals.visits)} tone="brand" icon="🧾" />
        <StatCard label={t('customers.balanceDue')} value={money(totals.due)} tone="red" icon="⏳" />
        <StatCard label={t('customers.loyaltyPoints')} value={num(customer.loyaltyPoints)} tone="amber" icon="🎁" />
        <StatCard label={t('customers.lastVisit')} value={date(totals.lastVisit)} tone="violet" icon="📅" />
      </div>

      <Tabs<TabKey>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'invoices', label: t('customers.invoicesTab'), count: invoices.length },
          { key: 'prescriptions', label: t('customers.prescriptionsTab'), count: prescriptions.length },
          { key: 'appointments', label: t('customers.appointmentsTab'), count: appointments.length },
          { key: 'labOrders', label: t('customers.labOrdersTab'), count: labOrders.length },
        ]}
      />

      {tab === 'invoices' && (
        <DataTable
          columns={invoiceColumns}
          rows={invoices}
          rowKey={(invoice) => invoice.id}
          pageSize={10}
          empty={<EmptyState icon="🧾" title={t('invoices.noInvoices')} />}
        />
      )}

      {tab === 'prescriptions' &&
        (prescriptions.length === 0 ? (
          <div className="card">
            <EmptyState icon="👁️" title={t('customers.noPrescriptions')} />
          </div>
        ) : (
          <div className="space-y-3">
            {prescriptions.map((prescription) => (
              <Card key={prescription.id} padded>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800">
                      {prescription.number} ·{' '}
                      {t(`prescriptions.type.${prescription.type}` as 'prescriptions.type.distance')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {date(prescription.date)} · {prescription.doctorName}
                      {prescription.clinic ? ` · ${prescription.clinic}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {prescription.nextVisit && (
                      <Badge tone={new Date(prescription.nextVisit).getTime() < Date.now() ? 'red' : 'green'}>
                        {t('prescriptions.nextVisit')}: {date(prescription.nextVisit)}
                      </Badge>
                    )}
                    {hasPermission('prescriptions.manage') && (
                      <>
                        <button
                          type="button"
                          className="btn-icon"
                          title={t('common.edit')}
                          onClick={() => {
                            setEditingRx(prescription);
                            setRxOpen(true);
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn-icon hover:bg-rose-50 hover:text-rose-600"
                          title={t('common.delete')}
                          onClick={() => handleDeleteRx(prescription)}
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="table table-compact min-w-[520px]">
                    <thead>
                      <tr>
                        <th>{t('prescriptions.eye')}</th>
                        <th className="text-center">{t('prescriptions.sph')}</th>
                        <th className="text-center">{t('prescriptions.cyl')}</th>
                        <th className="text-center">{t('prescriptions.axis')}</th>
                        <th className="text-center">{t('prescriptions.add')}</th>
                        <th className="text-center">{t('prescriptions.va')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="font-bold">{t('prescriptions.od')}</td>
                        <td className="text-center tabular-nums">{diopter(prescription.od.sph)}</td>
                        <td className="text-center tabular-nums">{diopter(prescription.od.cyl)}</td>
                        <td className="text-center tabular-nums">{prescription.od.axis ?? '—'}</td>
                        <td className="text-center tabular-nums">{diopter(prescription.od.add)}</td>
                        <td className="text-center">{prescription.od.va || '—'}</td>
                      </tr>
                      <tr>
                        <td className="font-bold">{t('prescriptions.os')}</td>
                        <td className="text-center tabular-nums">{diopter(prescription.os.sph)}</td>
                        <td className="text-center tabular-nums">{diopter(prescription.os.cyl)}</td>
                        <td className="text-center tabular-nums">{prescription.os.axis ?? '—'}</td>
                        <td className="text-center tabular-nums">{diopter(prescription.os.add)}</td>
                        <td className="text-center">{prescription.os.va || '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        ))}

      {tab === 'appointments' && (
        <DataTable<Appointment>
          columns={[
            { key: 'date', header: t('common.date'), render: (row) => date(row.date) },
            { key: 'time', header: t('common.time'), render: (row) => row.time },
            {
              key: 'type',
              header: t('common.type'),
              render: (row) => t(`appointments.type.${row.type}` as 'appointments.type.eye_exam'),
            },
            { key: 'doctor', header: t('appointments.doctor'), render: (row) => row.doctorName ?? '—' },
            {
              key: 'status',
              header: t('common.status'),
              align: 'center',
              render: (row) => (
                <Badge tone={APPOINTMENT_TONE[row.status]}>
                  {t(`appointments.status.${row.status}` as 'appointments.status.scheduled')}
                </Badge>
              ),
            },
          ]}
          rows={appointments}
          rowKey={(row) => row.id}
          pageSize={10}
          empty={<EmptyState icon="📅" title={t('appointments.noAppointments')} />}
        />
      )}

      {tab === 'labOrders' && (
        <DataTable<LabOrder>
          columns={[
            {
              key: 'number',
              header: t('lab.number'),
              render: (row) => <span className="font-bold text-slate-800">{row.number}</span>,
            },
            {
              key: 'type',
              header: t('lab.orderType'),
              render: (row) => t(`lab.types.${row.orderType}` as 'lab.types.distance'),
            },
            {
              key: 'expected',
              header: t('lab.expectedDate'),
              render: (row) => <span className="text-xs text-slate-500">{date(row.expectedDate)}</span>,
            },
            {
              key: 'status',
              header: t('common.status'),
              align: 'center',
              render: (row) => (
                <Badge tone={LAB_STATUS_TONE[row.status]}>
                  {t(`lab.status.${row.status}` as 'lab.status.draft')}
                </Badge>
              ),
            },
            {
              key: 'balance',
              header: t('lab.balance'),
              align: 'end',
              render: (row) => <span className="font-bold tabular-nums">{money(row.total - row.deposit)}</span>,
            },
          ]}
          rows={labOrders}
          rowKey={(row) => row.id}
          pageSize={10}
          empty={<EmptyState icon="🔬" title={t('lab.noOrders')} />}
        />
      )}

      <CustomerFormModal open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />
      <PrescriptionFormModal
        open={rxOpen}
        onClose={() => setRxOpen(false)}
        prescription={editingRx}
        customerId={customer.id}
        onSaved={() => setTab('prescriptions')}
      />


    </div>
  );
}

