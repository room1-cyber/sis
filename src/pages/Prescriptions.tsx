import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n } from '@/i18n';
import { Badge, DataTable, PageHeader, SearchInput, StatCard, Toolbar, type Column } from '@/components/ui';
import { useConfirm, useToast } from '@/components/feedback';
import { PrescriptionFormModal } from '@/components/PrescriptionFormModal';
import { downloadCsv } from '@/store/db';
import { daysUntil } from '@/lib/date';
import type { Prescription } from '@/types';

type RxState = 'valid' | 'soon' | 'expired';

const RX_TYPES = ['distance', 'reading', 'bifocal', 'progressive', 'contact'] as const;

export function Prescriptions() {
  const { t, num, date, diopter } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const { prescriptions, customers, customerById, deletePrescription, settings } = useData();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Prescription['type']>('all');
  const [stateFilter, setStateFilter] = useState<'all' | RxState>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Prescription | null>(null);

  const rows = useMemo(() => {
    const stateOf = (prescription: Prescription): RxState => {
      const remaining = daysUntil(prescription.nextVisit);
      if (remaining === null) return 'valid';
      if (remaining < 0) return 'expired';
      if (remaining <= settings.expiryWarningDays) return 'soon';
      return 'valid';
    };
    const term = query.trim().toLowerCase();
    return prescriptions
      .filter((prescription) => {
        const customer = customerById(prescription.customerId);
        const matchesTerm =
          !term ||
          [prescription.number, prescription.doctorName, prescription.diagnosis, customer?.name, customer?.phone]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term));
        const matchesType = typeFilter === 'all' || prescription.type === typeFilter;
        const matchesState = stateFilter === 'all' || stateOf(prescription) === stateFilter;
        return matchesTerm && matchesType && matchesState;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [prescriptions, query, typeFilter, stateFilter, customerById, settings.expiryWarningDays]);

  const stats = useMemo(() => {
    const counts = { valid: 0, soon: 0, expired: 0 };
    prescriptions.forEach((prescription) => {
      const remaining = daysUntil(prescription.nextVisit);
      if (remaining === null) counts.valid += 1;
      else if (remaining < 0) counts.expired += 1;
      else if (remaining <= settings.expiryWarningDays) counts.soon += 1;
      else counts.valid += 1;
    });
    return counts;
  }, [prescriptions, settings.expiryWarningDays]);

  const stateOf = (prescription: Prescription): RxState => {
    const remaining = daysUntil(prescription.nextVisit);
    if (remaining === null) return 'valid';
    if (remaining < 0) return 'expired';
    if (remaining <= settings.expiryWarningDays) return 'soon';
    return 'valid';
  };

  const handleDelete = async (prescription: Prescription) => {
    const ok = await confirm({ message: t('common.deleteConfirmBody') });
    if (!ok) return;
    deletePrescription(prescription.id);
    toast.success(t('prescriptions.deleted'));
  };

  const exportCsv = () =>
    downloadCsv(
      'prescriptions.csv',
      rows.map((prescription) => ({
        number: prescription.number,
        customer: customerById(prescription.customerId)?.name ?? '',
        date: prescription.date,
        type: prescription.type,
        doctor: prescription.doctorName,
        odSph: prescription.od.sph,
        odCyl: prescription.od.cyl,
        odAxis: prescription.od.axis,
        osSph: prescription.os.sph,
        osCyl: prescription.os.cyl,
        osAxis: prescription.os.axis,
        pd: prescription.pd,
      })),
    );

  const columns: Array<Column<Prescription>> = [
    {
      key: 'number',
      header: t('prescriptions.number'),
      render: (prescription) => <span className="font-bold text-slate-800">{prescription.number}</span>,
      sortValue: (prescription) => prescription.number,
    },
    {
      key: 'customer',
      header: t('prescriptions.customer'),
      render: (prescription) => {
        const customer = customerById(prescription.customerId);
        return customer ? (
          <button type="button" className="link text-start" onClick={() => navigate(`/customers/${customer.id}`)}>
            {customer.name}
          </button>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
      sortValue: (prescription) => customerById(prescription.customerId)?.name ?? '',
    },
    {
      key: 'date',
      header: t('common.date'),
      render: (prescription) => <span className="text-xs text-slate-500">{date(prescription.date)}</span>,
      sortValue: (prescription) => prescription.date,
    },
    {
      key: 'type',
      header: t('prescriptions.type'),
      render: (prescription) => (
        <Badge tone="blue">{t(`prescriptions.type.${prescription.type}` as 'prescriptions.type.distance')}</Badge>
      ),
    },
    {
      key: 'od',
      header: t('prescriptions.od'),
      render: (prescription) => (
        <span dir="ltr" className="font-mono text-xs text-slate-600">
          {diopter(prescription.od.sph)} / {diopter(prescription.od.cyl)} × {prescription.od.axis ?? '—'}
        </span>
      ),
    },
    {
      key: 'os',
      header: t('prescriptions.os'),
      render: (prescription) => (
        <span dir="ltr" className="font-mono text-xs text-slate-600">
          {diopter(prescription.os.sph)} / {diopter(prescription.os.cyl)} × {prescription.os.axis ?? '—'}
        </span>
      ),
    },
    {
      key: 'pd',
      header: t('prescriptions.pd'),
      align: 'center',
      render: (prescription) => <span className="tabular-nums">{prescription.pd ?? '—'}</span>,
    },
    {
      key: 'state',
      header: t('common.status'),
      align: 'center',
      render: (prescription) => {
        const state = stateOf(prescription);
        return (
          <Badge tone={state === 'expired' ? 'red' : state === 'soon' ? 'amber' : 'green'}>
            {t(`prescriptions.${state}` as 'prescriptions.valid')}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (prescription) =>
        hasPermission('prescriptions.manage') ? (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn-icon"
              title={t('common.edit')}
              onClick={() => {
                setEditing(prescription);
                setFormOpen(true);
              }}
            >
              ✏️
            </button>
            <button
              type="button"
              className="btn-icon hover:bg-rose-50 hover:text-rose-600"
              title={t('common.delete')}
              onClick={() => handleDelete(prescription)}
            >
              🗑️
            </button>
          </div>
        ) : null,
    },
  ];


  return (
    <div>
      <PageHeader
        title={t('prescriptions.title')}
        subtitle={t('prescriptions.subtitle')}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={exportCsv}>
              ⬇️ {t('common.exportCsv')}
            </button>
            {hasPermission('prescriptions.manage') && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                ➕ {t('prescriptions.new')}
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('prescriptions.title')} value={num(prescriptions.length)} tone="brand" icon="👁️" />
        <StatCard label={t('prescriptions.valid')} value={num(stats.valid)} tone="green" icon="✅" />
        <StatCard label={t('prescriptions.expiresSoon')} value={num(stats.soon)} tone="amber" icon="⏰" />
        <StatCard label={t('prescriptions.expired')} value={num(stats.expired)} tone="red" icon="⚠️" />
      </div>

      <Toolbar>
        <SearchInput
          className="w-full sm:max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={t('prescriptions.number')}
        />
        <select
          className="select w-auto"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
        >
          <option value="all">
            {t('prescriptions.type')}: {t('common.all')}
          </option>
          {RX_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`prescriptions.type.${type}` as 'prescriptions.type.distance')}
            </option>
          ))}
        </select>
        <select
          className="select w-auto"
          value={stateFilter}
          onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}
        >
          <option value="all">
            {t('common.status')}: {t('common.all')}
          </option>
          <option value="valid">{t('prescriptions.valid')}</option>
          <option value="soon">{t('prescriptions.expiresSoon')}</option>
          <option value="expired">{t('prescriptions.expired')}</option>
        </select>
        <span className="ms-auto text-sm text-slate-500">
          {num(rows.length)} {t('common.of')} {num(prescriptions.length)}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(prescription) => prescription.id}
        pageSize={25}
        empty={
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            {customers.length === 0 ? t('customers.noCustomers') : t('prescriptions.noPrescriptions')}
          </p>
        }
      />

      <PrescriptionFormModal open={formOpen} onClose={() => setFormOpen(false)} prescription={editing} />
    </div>
  );
}

