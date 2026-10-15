import { useMemo, useState } from 'react';
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
import { PRODUCT_CATEGORIES, ProductFormModal } from '@/components/ProductFormModal';
import { inventoryStats, productMarginPercent, productSales } from '@/lib/calc';
import { downloadCsv } from '@/store/db';
import type { Product, ProductCategory } from '@/types';

/** Small dialog to add / remove / override the quantity of a product. */
function StockAdjustModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { t, qty } = useI18n();
  const toast = useToast();
  const { adjustStock } = useData();
  const [mode, setMode] = useState<'in' | 'out' | 'set'>('in');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');

  const submit = () => {
    if (!product) return;
    const value = Number(quantity);
    if (!Number.isFinite(value) || value < 0) return;
    adjustStock({ productId: product.id, mode, quantity: value, reason: reason.trim() || undefined });
    toast.success(t('products.stockUpdated'));
    onClose();
  };

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      size="sm"
      title={t('products.adjustStockTitle')}
      subtitle={product ? `${product.nameAr} — ${t('products.stock')}: ${qty(product.quantity)}` : undefined}
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
        <div className="flex flex-wrap gap-2">
          {(['in', 'out', 'set'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`tab ${mode === option ? 'tab-active' : ''}`}
              onClick={() => setMode(option)}
            >
              {option === 'in'
                ? t('products.addStock')
                : option === 'out'
                  ? t('products.removeStock')
                  : t('products.setStock')}
            </button>
          ))}
        </div>
        <Field label={t('common.quantity')} required>
          <input
            className="input"
            dir="ltr"
            type="number"
            min={0}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
        <Field label={t('products.reason')}>
          <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function Products() {
  const { t, pick, money, moneyShort, num, qty } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const { products, suppliers, supplierById, deleteProduct, invoices, settings } = useData();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ProductCategory>('all');
  const [supplierId, setSupplierId] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const stats = useMemo(
    () => inventoryStats(products, settings.lowStockThreshold),
    [products, settings.lowStockThreshold],
  );
  const soldByProduct = useMemo(
    () => new Map(productSales(invoices).map((row) => [row.productId, row])),
    [invoices],
  );

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter((product) => {
        if (!showInactive && !product.active) return false;
        const matchesTerm =
          !term ||
          [product.nameAr, product.nameEn, product.sku, product.barcode, product.brand, product.model]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term));
        const matchesCategory = category === 'all' || product.category === category;
        const matchesSupplier = supplierId === 'all' || product.supplierId === supplierId;
        const threshold = product.minQuantity || settings.lowStockThreshold;
        const matchesStock =
          stockFilter === 'all' ||
          (stockFilter === 'low' && product.quantity > 0 && product.quantity <= threshold) ||
          (stockFilter === 'out' && product.quantity <= 0);
        return matchesTerm && matchesCategory && matchesSupplier && matchesStock;
      })
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
  }, [products, query, category, supplierId, stockFilter, showInactive, settings.lowStockThreshold]);

  const handleDelete = async (product: Product) => {
    const ok = await confirm({ message: t('common.deleteConfirmBody') });
    if (!ok) return;
    deleteProduct(product.id);
    toast.success(t('products.deleted'));
  };

  const exportCsv = () =>
    downloadCsv(
      'products.csv',
      rows.map((product) => ({
        sku: product.sku,
        barcode: product.barcode ?? '',
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        category: product.category,
        brand: product.brand ?? '',
        cost: product.cost,
        price: product.price,
        quantity: product.quantity,
        minQuantity: product.minQuantity,
        supplier: supplierById(product.supplierId)?.name ?? '',
      })),
    );

  const columns: Array<Column<Product>> = [
    {
      key: 'name',
      header: t('common.name'),
      render: (product) => (
        <span>
          <span className="block font-semibold text-slate-800">{pick(product.nameAr, product.nameEn)}</span>
          <span className="block font-mono text-[11px] text-slate-400">
            {product.sku}
            {product.barcode ? ` · ${product.barcode}` : ''}
          </span>
        </span>
      ),
      sortValue: (product) => product.nameAr,
    },
    {
      key: 'category',
      header: t('common.category'),
      render: (product) => (
        <Badge tone="brand">{t(`products.cat.${product.category}` as 'products.cat.frames')}</Badge>
      ),
    },
    {
      key: 'brand',
      header: t('common.brand'),
      render: (product) => (
        <span className="text-slate-600">
          {product.brand || '—'}
          {product.size ? ` · ${product.size}` : ''}
        </span>
      ),
    },
    {
      key: 'stock',
      header: t('products.stock'),
      align: 'center',
      render: (product) => {
        const threshold = product.minQuantity || settings.lowStockThreshold;
        const tone = product.quantity <= 0 ? 'red' : product.quantity <= threshold ? 'amber' : 'green';
        return (
          <Badge tone={tone}>
            {qty(product.quantity)} {t('common.pieces')}
          </Badge>
        );
      },
      sortValue: (product) => product.quantity,
    },
    {
      key: 'cost',
      header: t('products.purchasePrice'),
      align: 'end',
      render: (product) => <span className="tabular-nums text-slate-500">{money(product.cost)}</span>,
      sortValue: (product) => product.cost,
    },
    {
      key: 'price',
      header: t('products.sellPrice'),
      align: 'end',
      render: (product) => <span className="font-bold tabular-nums">{money(product.price)}</span>,
      sortValue: (product) => product.price,
    },
    {
      key: 'margin',
      header: t('products.marginPercent'),
      align: 'center',
      render: (product) => {
        const margin = productMarginPercent(product);
        return (
          <Badge tone={margin >= 40 ? 'green' : margin >= 20 ? 'amber' : 'red'}>
            {num(margin, { maximumFractionDigits: 1 })}%
          </Badge>
        );
      },
      sortValue: (product) => productMarginPercent(product),
    },
    {
      key: 'sold',
      header: t('products.unitsSold'),
      align: 'center',
      render: (product) => <span className="tabular-nums">{num(soldByProduct.get(product.id)?.quantity ?? 0)}</span>,
      sortValue: (product) => soldByProduct.get(product.id)?.quantity ?? 0,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (product) => (
        <div className="flex justify-end gap-1">
          {hasPermission('stock.manage') && (
            <button
              type="button"
              className="btn-icon"
              title={t('products.adjustStock')}
              onClick={() => setAdjusting(product)}
            >
              📦
            </button>
          )}
          {hasPermission('products.manage') && (
            <>
              <button
                type="button"
                className="btn-icon"
                title={t('common.edit')}
                onClick={() => {
                  setEditing(product);
                  setFormOpen(true);
                }}
              >
                ✏️
              </button>
              <button
                type="button"
                className="btn-icon hover:bg-rose-50 hover:text-rose-600"
                title={t('common.delete')}
                onClick={() => handleDelete(product)}
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
        title={t('products.title')}
        subtitle={t('products.subtitle')}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={exportCsv}>
              ⬇️ {t('common.exportCsv')}
            </button>
            {hasPermission('products.manage') && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                ➕ {t('products.new')}
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('products.title')}
          value={num(stats.activeCount)}
          tone="brand"
          icon="🕶️"
          hint={`${t('dashboard.unitsInStock')}: ${num(stats.units)}`}
        />
        <StatCard label={t('products.stockValue')} value={moneyShort(stats.retailValue)} tone="green" icon="💰" />
        <StatCard
          label={t('products.lowStock')}
          value={num(stats.lowStock.length)}
          tone="amber"
          icon="⚠️"
          hint={t('dashboard.lowStockHint', { value: num(settings.lowStockThreshold) })}
        />
        <StatCard label={t('products.outOfStock')} value={num(stats.outOfStock.length)} tone="red" icon="⛔" />
      </div>

      <Toolbar>
        <SearchInput
          className="w-full sm:max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={t('products.searchPlaceholder')}
        />
        <select
          className="select w-auto"
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
        >
          <option value="all">
            {t('common.category')}: {t('common.all')}
          </option>
          {PRODUCT_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {t(`products.cat.${item}` as 'products.cat.frames')}
            </option>
          ))}
        </select>
        <select
          className="select w-auto"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="all">
            {t('products.supplier')}: {t('common.all')}
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <select
          className="select w-auto"
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}
        >
          <option value="all">{t('products.stock')}: {t('common.all')}</option>
          <option value="low">{t('products.lowStock')}</option>
          <option value="out">{t('products.outOfStock')}</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          {t('products.showInactive')}
        </label>
        <span className="ms-auto text-sm text-slate-500">
          {num(rows.length)} {t('common.of')} {num(products.length)}
        </span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(product) => product.id}
        pageSize={25}
        empty={<p className="px-5 py-10 text-center text-sm text-slate-400">{t('products.noProducts')}</p>}
      />

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
      <StockAdjustModal product={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}

