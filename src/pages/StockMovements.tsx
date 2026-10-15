import { useCallback, useMemo, useState } from 'react';
import { useData } from '@/store/DataContext';
import { useAuth } from '@/store/AuthContext';
import { useI18n, type TranslationKey } from '@/i18n';
import {
  Badge,
  DataTable,
  PageHeader,
  SearchInput,
  StatCard,
  Toolbar,
  type Column,
  type Tone,
} from '@/components/ui';
import { inRange, periodRange, type PeriodKey } from '@/lib/date';
import { downloadCsv } from '@/store/db';
import type { StockMovement, StockMovementType } from '@/types';

/* ---------------------------------------------------------------------------
 * Stock movement log: read-only history of every quantity change.
 * The translation keys are mapped explicitly so `t()` stays type safe.
 * ------------------------------------------------------------------------- */

const TYPE_LABEL: Record<StockMovementType, TranslationKey> = {
  in: 'stock.type.in',
  out: 'stock.type.out',
  adjust: 'stock.type.adjust',
  sale: 'stock.type.sale',
  return: 'stock.type.return',
  purchase: 'stock.type.purchase',
  damage: 'stock.type.damage',
};

const TYPE_TONE: Record<StockMovementType, Tone> = {
  in: 'green',
  purchase: 'green',
  return: 'green',
  out: 'red',
  sale: 'red',
  adjust: 'amber',
  damage: 'amber',
};

const MOVEMENT_TYPES: StockMovementType[] = ['in', 'out', 'adjust', 'sale', 'return', 'purchase', 'damage'];

const PERIODS: PeriodKey[] = [
  'all',
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
];

const PERIOD_LABEL: Record<PeriodKey, TranslationKey> = {
  today: 'reports.period.today',
  yesterday: 'reports.period.yesterday',
  last7: 'reports.period.last7',
  last30: 'reports.period.last30',
  thisMonth: 'reports.period.thisMonth',
  lastMonth: 'reports.period.lastMonth',
  thisQuarter: 'reports.period.thisQuarter',
  thisYear: 'reports.period.thisYear',
  all: 'reports.period.all',
  custom: 'reports.period.custom',
};

export function StockMovements() {
  const { t, num, dateTime, pick } = useI18n();
  const { hasPermission } = useAuth();
  const { stockMovements, productById } = useData();

  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | StockMovementType>('all');
  const [period, setPeriod] = useState<PeriodKey>('all');

  // The route guard already restricts the page; the permission only controls
  // the visibility of the export affordance here.
  const canView = hasPermission('products.view');

  const productName = useCallback(
    (movement: StockMovement) => {
      const product = productById(movement.productId);
      return product ? pick(product.nameAr, product.nameEn) : movement.productName;
    },
    [productById, pick],
  );

  const range = useMemo(() => periodRange(period), [period]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return stockMovements
      .filter((movement) => {
        const matchesTerm =
          !term ||
          [productName(movement), movement.reference, movement.reason]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term));
        const matchesType = type === 'all' || movement.type === type;
        return matchesTerm && matchesType && inRange(movement.date, range);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [stockMovements, productName, query, type, range]);

  const stats = useMemo(
    () => ({
      total: stockMovements.length,
      incoming: stockMovements.reduce((sum, movement) => sum + Math.max(movement.quantity, 0), 0),
      outgoing: stockMovements.reduce((sum, movement) => sum + Math.max(-movement.quantity, 0), 0),
      adjustments: stockMovements.filter((movement) => movement.type === 'adjust' || movement.type === 'damage')
        .length,
    }),
    [stockMovements],
  );

  const exportCsv = () =>
    downloadCsv(
      'stock-movements.csv',
      rows.map((movement) => ({
        date: movement.date,
        product: productName(movement),
        type: movement.type,
        quantity: movement.quantity,
        previousQty: movement.previousQty,
        newQty: movement.newQty,
        reference: movement.reference ?? '',
        user: movement.userName,
        reason: movement.reason ?? '',
      })),
    );

  const columns: Array<Column<StockMovement>> = [
    {
      key: 'date',
      header: t('common.date'),
      render: (movement) => (
        <span className="whitespace-nowrap tabular-nums text-slate-600">{dateTime(movement.date)}</span>
      ),
      sortValue: (movement) => movement.date,
    },
    {
      key: 'product',
      header: t('stock.product'),
      render: (movement) => <span className="font-semibold text-slate-800">{productName(movement)}</span>,
      sortValue: (movement) => productName(movement),
    },
    {
      key: 'type',
      header: t('common.type'),
      render: (movement) => <Badge tone={TYPE_TONE[movement.type]}>{t(TYPE_LABEL[movement.type])}</Badge>,
      sortValue: (movement) => movement.type,
    },
    {
      key: 'change',
      header: t('stock.change'),
      align: 'center',
      render: (movement) => (
        <span
          dir="ltr"
          className={`font-bold tabular-nums ${movement.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
        >
          {movement.quantity >= 0 ? '+' : '-'}
          {num(Math.abs(movement.quantity))}
        </span>
      ),
      sortValue: (movement) => movement.quantity,
    },
    {
      key: 'balance',
      header: t('products.stock'),
      align: 'center',
      render: (movement) => (
        <span dir="ltr" className="whitespace-nowrap tabular-nums text-slate-500">
          {num(movement.previousQty)} → {num(movement.newQty)}
        </span>
      ),
      sortValue: (movement) => movement.newQty,
    },
    {
      key: 'reference',
      header: t('common.reference'),
      render: (movement) => (
        <span className="font-mono text-[11px] text-slate-500">{movement.reference ?? '—'}</span>
      ),
    },
    {
      key: 'user',
      header: t('stock.user'),
      render: (movement) => <span className="text-slate-600">{movement.userName}</span>,
      sortValue: (movement) => movement.userName,
    },
    {
      key: 'reason',
      header: t('products.reason'),
      render: (movement) => <span className="text-slate-500">{movement.reason ?? '—'}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('stock.title')}
        subtitle={t('stock.subtitle')}
        actions={
          canView && (
            <button type="button" className="btn-secondary" onClick={exportCsv}>
              ⬇️ {t('common.exportCsv')}
            </button>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('stock.title')} value={num(stats.total)} tone="brand" icon="📦" />
        <StatCard
          label={t('stock.type.in')}
          value={num(stats.incoming)}
          tone="green"
          icon="⬆️"
          hint={t('common.total')}
        />
        <StatCard
          label={t('stock.type.out')}
          value={num(stats.outgoing)}
          tone="red"
          icon="⬇️"
          hint={t('common.total')}
        />
        <StatCard
          label={t('stock.type.adjust')}
          value={num(stats.adjustments)}
          tone="amber"
          icon="🛠️"
          hint={t('stock.type.damage')}
        />
      </div>

      <Toolbar>
        <SearchInput
          className="w-full sm:max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={t('common.searchPlaceholder')}
        />
        <select
          className="select w-auto"
          value={type}
          onChange={(event) => setType(event.target.value as 'all' | StockMovementType)}
        >
          <option value="all">
            {t('common.type')}: {t('common.all')}
          </option>
          {MOVEMENT_TYPES.map((item) => (
            <option key={item} value={item}>
              {t(TYPE_LABEL[item])}
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
              {t(PERIOD_LABEL[item])}
            </option>
          ))}
        </select>
        <span className="ms-auto text-sm text-slate-500">
          {num(rows.length)} {t('common.of')} {num(stockMovements.length)}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(movement) => movement.id}
        pageSize={25}
        empty={<p className="px-5 py-10 text-center text-sm text-slate-400">{t('stock.noMovements')}</p>}
      />
    </div>
  );
}
