import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n } from '@/i18n';
import { Badge, Card, DataTable, PageHeader, StatCard, type Column } from '@/components/ui';
import { DonutChart, TrendChart } from '@/components/charts';
import {
  inventoryStats,
  invoiceProfit,
  productSales,
  receivables,
  salesByCategory,
  salesSeries,
  sumBy,
} from '@/lib/calc';
import { inRange, isSameDay, periodRange } from '@/lib/date';
import type { Invoice, LabOrder, ProductCategory } from '@/types';
import { LAB_STATUS_TONE } from '@/pages/labOrderMeta';

const INVOICE_STATUS_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'red',
  returned: 'violet',
  cancelled: 'gray',
} as const;

export function Dashboard() {
  const { t, pick, money, moneyShort, num, qty, date, month } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { invoices, products, customers, appointments, labOrders, prescriptions, settings, returns } = useData();
  const [trend, setTrend] = useState<'day' | 'month'>('day');

  const stats = useMemo(() => {
    const todayRange = periodRange('today');
    const yesterdayRange = periodRange('yesterday');
    const monthRange = periodRange('thisMonth');

    const active = invoices.filter((invoice) => invoice.status !== 'cancelled');
    const todayInvoices = active.filter((invoice) => inRange(invoice.createdAt, todayRange));
    const yesterdayInvoices = active.filter((invoice) => inRange(invoice.createdAt, yesterdayRange));
    const monthInvoices = active.filter((invoice) => inRange(invoice.createdAt, monthRange));

    const todaySales = sumBy(todayInvoices, (invoice) => invoice.total - invoice.refunded);
    const yesterdaySales = sumBy(yesterdayInvoices, (invoice) => invoice.total - invoice.refunded);
    const monthSales = sumBy(monthInvoices, (invoice) => invoice.total - invoice.refunded);
    const monthProfit = sumBy(monthInvoices, (invoice) => invoiceProfit(invoice));
    const inventory = inventoryStats(products, settings.lowStockThreshold);

    return {
      todaySales,
      yesterdaySales,
      monthSales,
      monthProfit,
      monthInvoices,
      todayInvoices,
      inventory,
      todayReturns: returns.filter((item) => isSameDay(item.date, new Date())),
      todayAppointments: appointments
        .filter((item) => isSameDay(item.date, new Date()) && item.status !== 'cancelled')
        .sort((a, b) => a.time.localeCompare(b.time)),
      openLabOrders: labOrders.filter((item) => item.status !== 'delivered' && item.status !== 'cancelled'),
      due: receivables(invoices),
      growth: yesterdaySales > 0 ? ((todaySales - yesterdaySales) / yesterdaySales) * 100 : null,
    };
  }, [invoices, products, settings.lowStockThreshold, appointments, labOrders, returns]);

  const trendPoints = useMemo(
    () =>
      salesSeries(invoices, trend === 'day' ? 30 : 12, trend, (iso, granularity) =>
        granularity === 'month' ? month(iso) : date(iso).replace(/\s\d{4}$/, ''),
      ).map((point) => ({ label: point.label, value: point.value, secondary: point.secondary })),
    [invoices, trend, month, date],
  );

  const categorySlices = useMemo(
    () =>
      salesByCategory(invoices)
        .slice(0, 6)
        .map((slice) => ({
          label: t(`products.cat.${slice.key}` as `products.cat.${ProductCategory}`),
          value: slice.value,
        })),
    [invoices, t],
  );

  const topProducts = useMemo(() => productSales(invoices).slice(0, 6), [invoices]);

  const recentInvoices = useMemo(
    () => invoices.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [invoices],
  );

  const expiringPrescriptions = useMemo(() => {
    const limit = settings.expiryWarningDays;
    return prescriptions
      .filter((item) => {
        if (!item.nextVisit) return false;
        return (new Date(item.nextVisit).getTime() - Date.now()) / 86400000 <= limit;
      })
      .sort((a, b) => (a.nextVisit ?? '').localeCompare(b.nextVisit ?? ''))
      .slice(0, 5);
  }, [prescriptions, settings.expiryWarningDays]);

  const invoiceColumns: Array<Column<Invoice>> = [
    {
      key: 'number',
      header: t('invoices.number'),
      render: (invoice) => <span className="font-bold text-slate-800">{invoice.number}</span>,
    },
    {
      key: 'customer',
      header: t('invoices.customer'),
      render: (invoice) => <span className="text-slate-600">{invoice.customerName}</span>,
    },
    {
      key: 'date',
      header: t('common.date'),
      render: (invoice) => <span className="text-xs text-slate-500">{date(invoice.createdAt)}</span>,
    },
    {
      key: 'total',
      header: t('common.total'),
      align: 'end',
      render: (invoice) => <span className="font-bold tabular-nums">{money(invoice.total)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      align: 'center',
      render: (invoice) => (
        <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>
          {t(`invoices.status.${invoice.status}` as 'invoices.status.paid')}
        </Badge>
      ),
    },
  ];

  const lowStock = [...stats.inventory.lowStock, ...stats.inventory.outOfStock].slice(0, 6);

  // __APPEND_DASHBOARD__

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <>
            {hasPermission('pos.use') && (
              <button type="button" className="btn-primary" onClick={() => navigate('/pos')}>
                🛒 {t('dashboard.newSale')}
              </button>
            )}
            {hasPermission('customers.manage') && (
              <button type="button" className="btn-secondary" onClick={() => navigate('/customers')}>
                👥 {t('dashboard.newCustomer')}
              </button>
            )}
            {hasPermission('prescriptions.manage') && (
              <button type="button" className="btn-secondary" onClick={() => navigate('/prescriptions')}>
                👁️ {t('dashboard.newPrescription')}
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.todaySales')}
          value={money(stats.todaySales)}
          tone="green"
          icon="💰"
          hint={
            stats.growth === null
              ? t('dashboard.vsYesterday')
              : `${stats.growth >= 0 ? '▲' : '▼'} ${num(Math.abs(stats.growth), {
                  maximumFractionDigits: 1,
                })}% ${t('dashboard.vsYesterday')}`
          }
        />
        <StatCard
          label={t('dashboard.monthSales')}
          value={moneyShort(stats.monthSales)}
          tone="brand"
          icon="📈"
          hint={`${t('dashboard.invoicesCount')}: ${num(stats.monthInvoices.length)}`}
        />
        <StatCard
          label={t('dashboard.monthProfit')}
          value={moneyShort(stats.monthProfit)}
          tone="violet"
          icon="📊"
          hint={t('dashboard.grossProfit')}
        />
        <StatCard
          label={t('dashboard.receivables')}
          value={moneyShort(stats.due)}
          tone="amber"
          icon="🧾"
          hint={t('customers.outstanding')}
        />
        <StatCard
          label={t('dashboard.totalCustomers')}
          value={num(customers.length)}
          tone="blue"
          icon="👥"
          hint={`${t('dashboard.todayAppointments')}: ${num(stats.todayAppointments.length)}`}
        />
        <StatCard
          label={t('dashboard.inventoryValue')}
          value={moneyShort(stats.inventory.retailValue)}
          tone="brand"
          icon="🕶️"
          hint={`${t('dashboard.unitsInStock')}: ${num(stats.inventory.units)}`}
        />
        <StatCard
          label={t('dashboard.lowStock')}
          value={num(stats.inventory.lowStock.length + stats.inventory.outOfStock.length)}
          tone="red"
          icon="⚠️"
          hint={t('dashboard.lowStockHint', { value: num(settings.lowStockThreshold) })}
        />
        <StatCard
          label={t('dashboard.labInProgress')}
          value={num(stats.openLabOrders.length)}
          tone="violet"
          icon="🔬"
          hint={t('dashboard.pendingLabOrders')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={t('dashboard.salesTrend')}
          actions={
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                className={`tab ${trend === 'day' ? 'tab-active' : ''}`}
                onClick={() => setTrend('day')}
              >
                {t('dashboard.last30Days')}
              </button>
              <button
                type="button"
                className={`tab ${trend === 'month' ? 'tab-active' : ''}`}
                onClick={() => setTrend('month')}
              >
                {t('dashboard.last12Months')}
              </button>
            </div>
          }
        >
          <TrendChart
            points={trendPoints}
            showSecondary
            primaryLabel={t('dashboard.netSales')}
            secondaryLabel={t('dashboard.grossProfit')}
            formatValue={(value) => moneyShort(value)}
          />
        </Card>

        <Card title={t('dashboard.salesByCategory')}>
          {categorySlices.length > 0 ? (
            <DonutChart slices={categorySlices} formatValue={(value) => moneyShort(value)} />
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">{t('common.noData')}</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('dashboard.topProducts')}>
          {topProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('common.noData')}</p>
          ) : (
            <ul className="space-y-3">
              {topProducts.map((row, index) => (
                <li key={row.productId} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
                    {num(index + 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-700">
                      {pick(row.nameAr, row.nameEn)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {t('dashboard.itemsSold')}: {num(row.quantity)}
                    </span>
                  </span>
                  <span className="text-sm font-bold tabular-nums text-slate-800">{moneyShort(row.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('dashboard.lowStockAlert')} subtitle={t('dashboard.lowStock')}>
          {lowStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('dashboard.noAlerts')}</p>
          ) : (
            <ul className="space-y-2">
              {lowStock.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-700">
                      {pick(product.nameAr, product.nameEn)}
                    </span>
                    <span className="text-xs text-slate-400">{product.sku}</span>
                  </span>
                  <Badge tone={product.quantity <= 0 ? 'red' : 'amber'}>
                    {qty(product.quantity)} {t('common.pieces')}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('dashboard.todayAppointments')} subtitle={t('dashboard.upcomingAppointments')}>
          {stats.todayAppointments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('appointments.noAppointments')}</p>
          ) : (
            <ul className="space-y-2">
              {stats.todayAppointments.slice(0, 5).map((appointment) => (
                <li key={appointment.id} className="flex items-center gap-3">
                  <span className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">
                    {appointment.time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-700">
                      {appointment.customerName}
                    </span>
                    <span className="text-xs text-slate-400">
                      {t(`appointments.type.${appointment.type}` as 'appointments.type.eye_exam')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={t('dashboard.recentInvoices')} bodyClassName="!p-0">
          <DataTable
            columns={invoiceColumns}
            rows={recentInvoices}
            rowKey={(invoice) => invoice.id}
            dense
            onRowClick={(invoice) => navigate(`/invoices/${invoice.id}`)}
            empty={<p className="px-5 py-8 text-center text-sm text-slate-400">{t('invoices.noInvoices')}</p>}
          />
        </Card>

        <Card title={t('dashboard.expiringRx')} subtitle={t('dashboard.expiringRxHint')}>
          {expiringPrescriptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t('dashboard.noAlerts')}</p>
          ) : (
            <ul className="space-y-2">
              {expiringPrescriptions.map((prescription) => (
                <li key={prescription.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-700">{prescription.number}</p>
                  <p className="text-xs text-slate-400">
                    {t('prescriptions.nextVisit')}: {date(prescription.nextVisit)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="divider" />
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t('dashboard.returnsToday')}</span>
              <span className="font-bold text-slate-800">{num(stats.todayReturns.length)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t('dashboard.avgTicket')}</span>
              <span className="font-bold text-slate-800">
                {money(stats.todayInvoices.length > 0 ? stats.todaySales / stats.todayInvoices.length : 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t('dashboard.costValue')}</span>
              <span className="font-bold text-slate-800">{moneyShort(stats.inventory.costValue)}</span>
            </div>
            <Link to="/reports" className="link inline-block pt-1 text-xs">
              {t('nav.reports')} →
            </Link>
          </div>
        </Card>
      </div>

      <Card title={t('nav.labOrders')} subtitle={t('lab.subtitle')} bodyClassName="!p-0">
        {stats.openLabOrders.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">{t('lab.noOrders')}</p>
        ) : (
          <DataTable<LabOrder>
            columns={[
              {
                key: 'number',
                header: t('lab.number'),
                render: (order) => <span className="font-bold text-slate-800">{order.number}</span>,
              },
              { key: 'customer', header: t('lab.customer'), render: (order) => order.customerName },
              {
                key: 'expected',
                header: t('lab.expectedDate'),
                render: (order) => <span className="text-xs text-slate-500">{date(order.expectedDate)}</span>,
              },
              {
                key: 'status',
                header: t('lab.status'),
                align: 'center',
                render: (order) => (
                  <Badge tone={LAB_STATUS_TONE[order.status]}>
                    {t(`lab.status.${order.status}` as 'lab.status.draft')}
                  </Badge>
                ),
              },
              {
                key: 'balance',
                header: t('lab.balance'),
                align: 'end',
                render: (order) => (
                  <span className="font-bold tabular-nums">{money(order.total - order.deposit)}</span>
                ),
              },
            ]}
            rows={stats.openLabOrders.slice(0, 5)}
            rowKey={(order) => order.id}
            dense
            onRowClick={() => navigate('/lab-orders')}
          />
        )}
      </Card>
    </div>
  );
}


