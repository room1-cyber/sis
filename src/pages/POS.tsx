import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/DataContext';
import { useI18n, type TranslationKey } from '@/i18n';
import { Badge, Field, Modal, PageHeader } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { CustomerFormModal } from '@/components/CustomerFormModal';
import { computeInvoiceTotals, round2 } from '@/lib/calc';
import { atNoon, todayInput } from '@/lib/date';
import { PRODUCT_CATEGORIES } from '@/components/ProductFormModal';
import { LENS_INDEX_OPTIONS, LAB_COATINGS } from '@/pages/labOrderMeta';
import { uid } from '@/lib/id';
import type { CartLine, LensOptions, PaymentMethod, Product, ProductCategory, SaleItem } from '@/types';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'insurance', 'credit'];

/** `antiReflective` -> `lab.coatings.antiReflective` (translation key). */
function coatingLabel(key: string): TranslationKey {
  return `lab.coatings.${key}` as TranslationKey;
}

/** Per-line lens / coating options dialog. */
function LensOptionsModal({
  line,
  onClose,
  onSave,
}: {
  line: CartLine | null;
  onClose: () => void;
  onSave: (lineId: string, options: LensOptions, unitPrice: number) => void;
}) {
  const { t } = useI18n();
  const [options, setOptions] = useState<LensOptions>({ coating: [] });
  const [upgrade, setUpgrade] = useState('0');

  useEffect(() => {
    if (line) {
      setOptions(line.lensOptions ?? { coating: [] });
      setUpgrade(String(line.lensOptions?.upgradePrice ?? 0));
    }
  }, [line]);

  const toggleCoating = (key: string) =>
    setOptions((current) => {
      const coating = current.coating ?? [];
      return {
        ...current,
        coating: coating.includes(key) ? coating.filter((item) => item !== key) : [...coating, key],
      };
    });

  const save = () => {
    if (!line) return;
    const value = Number(upgrade);
    const base = line.product.price;
    onSave(
      line.lineId,
      { ...options, upgradePrice: Number.isFinite(value) ? value : 0 },
      round2(base + (Number.isFinite(value) ? value : 0)),
    );
    onClose();
  };

  return (
    <Modal
      open={Boolean(line)}
      onClose={onClose}
      size="md"
      title={t('pos.lensOptions')}
      subtitle={line?.product.nameAr}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            {t('common.apply')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('pos.lensIndex')}>
          <select
            className="select"
            value={options.index ?? ''}
            onChange={(event) => setOptions((current) => ({ ...current, index: event.target.value }))}
          >
            <option value="">{t('common.none')}</option>
            {LENS_INDEX_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pos.upgradePrice')} hint={t('common.amount')}>
          <input
            className="input"
            dir="ltr"
            type="number"
            step={0.01}
            value={upgrade}
            onChange={(event) => setUpgrade(event.target.value)}
          />
        </Field>
        <Field label={t('pos.tint')} className="sm:col-span-2">
          <input
            className="input"
            value={options.tint ?? ''}
            onChange={(event) => setOptions((current) => ({ ...current, tint: event.target.value }))}
          />
        </Field>
        <div className="sm:col-span-2">
          <p className="label">{t('pos.coating')}</p>
          <div className="flex flex-wrap gap-2">
            {LAB_COATINGS.map((key) => (
              <button
                key={key}
                type="button"
                className={`tab ${options.coating?.includes(key) ? 'tab-active' : ''}`}
                onClick={() => toggleCoating(key)}
              >
                {t(coatingLabel(key) as 'lab.coatings.antiReflective')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function POS() {
  const { t, pick, money, num, date } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { actor } = useData();
  const {
    products,
    customers,
    settings,
    createInvoice,
    createLabOrder,
    updateLabOrder,
    prescriptionsOf,
    customerById,
  } = useData();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ProductCategory>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [prescriptionId, setPrescriptionId] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [createLab, setCreateLab] = useState(true);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [optionsLine, setOptionsLine] = useState<CartLine | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const customer = customerById(customerId);
  const customerPrescriptions = useMemo(
    () => prescriptionsOf(customerId).slice().sort((a, b) => b.date.localeCompare(a.date)),
    [prescriptionsOf, customerId],
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter((product) => product.active && product.category !== 'services')
      .filter((product) => (category === 'all' ? true : product.category === category))
      .filter((product) => {
        if (!term) return true;
        return [product.nameAr, product.nameEn, product.sku, product.barcode, product.brand]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .slice(0, 24);
  }, [products, query, category]);

  const serviceProducts = useMemo(
    () => products.filter((product) => product.active && product.category === 'services'),
    [products],
  );

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        lines: cart.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice })),
        discount: Number(invoiceDiscount) || 0,
        taxRate: settings.taxRate,
        pricesIncludeTax: settings.pricesIncludeTax,
      }),
    [cart, invoiceDiscount, settings.taxRate, settings.pricesIncludeTax],
  );

  const paid = amountPaid === '' ? totals.total : Number(amountPaid) || 0;
  const change = round2(Math.max(paid - totals.total, 0));
  const remaining = round2(Math.max(totals.total - paid, 0));

  const addToCart = (product: Product, quantity = 1) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [
        ...current,
        {
          lineId: uid('cart'),
          product,
          quantity,
          unitPrice: product.price,
          discount: 0,
        },
      ];
    });
    searchRef.current?.focus();
  };

  const updateLine = (lineId: string, patch: Partial<CartLine>) =>
    setCart((current) => current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));

  const removeLine = (lineId: string) => setCart((current) => current.filter((line) => line.lineId !== lineId));

  const submitSearch = () => {
    const term = query.trim().toLowerCase();
    if (!term) return;
    const exact = products.find(
      (product) => product.barcode === term || product.sku.toLowerCase() === term,
    );
    const target = exact ?? results[0];
    if (target) {
      addToCart(target);
      setQuery('');
    }
  };

  const needsLabOrder = cart.some(
    (line) => line.product.category === 'frames' || line.product.category === 'lenses',
  );

  const clearCart = () => {
    setCart([]);
    setInvoiceDiscount('0');
    setAmountPaid('');
    setNotes('');
    setPrescriptionId('');
  };

  const completeSale = (print: boolean) => {
    if (cart.length === 0) {
      toast.warning(t('validation.atLeastOneItem'));
      return;
    }
    const overStock = cart.find(
      (line) => line.product.category !== 'services' && line.quantity > line.product.quantity,
    );
    if (overStock) {
      toast.error(`${t('pos.insufficientStock')} — ${overStock.product.nameAr}`);
      return;
    }

    const items: SaleItem[] = cart.map((line) => ({
      id: uid('item'),
      productId: line.product.id,
      sku: line.product.sku,
      nameAr: line.product.nameAr,
      nameEn: line.product.nameEn,
      category: line.product.category,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      listPrice: line.product.price,
      discount: round2(Math.max(line.product.price - line.unitPrice, 0)),
      unitCost: line.product.cost,
      lensOptions: line.lensOptions,
    }));

    // A lab order is created first so the invoice can reference it.
    let labOrderId: string | undefined;
    if (createLab && needsLabOrder) {
      const frameLine = cart.find((line) => line.product.category === 'frames');
      const lensLine = cart.find((line) => line.product.category === 'lenses');
      const order = createLabOrder({
        customerId: customerId || undefined,
        customerName: customer?.name ?? t('pos.walkIn'),
        customerPhone: customer?.phone,
        prescriptionId: prescriptionId || undefined,
        orderType: lensLine ? 'lens_only' : 'distance',
        frameProductId: frameLine?.product.id,
        frameDescription: frameLine ? `${frameLine.product.nameAr} ${frameLine.product.color ?? ''}`.trim() : '',
        lensType: lensLine?.product.nameAr ?? frameLine?.lensOptions?.lensType ?? '',
        lensIndex: frameLine?.lensOptions?.index ?? lensLine?.product.model ?? '',
        coating: frameLine?.lensOptions?.coating ?? [],
        tint: frameLine?.lensOptions?.tint ?? '',
        labName: '',
        expectedDate: atNoon(todayInput()),
        status: 'draft',
        total: totals.total,
        deposit: paid,
        notes: '',
        technician: actor.name,
      });
      labOrderId = order.id;
    }

    const invoice = createInvoice({
      customerId: customerId || undefined,
      customerName: customer?.name ?? t('pos.walkIn'),
      customerPhone: customer?.phone,
      items,
      discount: Number(invoiceDiscount) || 0,
      paymentMethod,
      amountPaid: paid,
      prescriptionId: prescriptionId || undefined,
      labOrderId,
      insuranceCompany: paymentMethod === 'insurance' ? customer?.insuranceCompany : undefined,
      notes: notes.trim() || undefined,
    });

    if (!invoice) {
      toast.error(t('common.error'));
      return;
    }

    if (labOrderId) {
      updateLabOrder(labOrderId, { invoiceId: invoice.id });
    }

    toast.success(`${t('pos.saleCompleted')} — ${invoice.number}`);
    clearCart();
    navigate(`/invoices/${invoice.id}${print ? '?print=1' : ''}`);
  };

  return (
    <div>
      <PageHeader title={t('pos.title')} subtitle={t('pos.subtitle')} />

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="space-y-3">
          <div className="card card-pad">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-slate-400">
                  🔍
                </span>
                <input
                  ref={searchRef}
                  autoFocus
                  className="input ps-9"
                  value={query}
                  placeholder={t('pos.searchProduct')}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitSearch();
                    }
                  }}
                />
              </div>
              <span className="text-xs text-slate-400">{t('common.barcode')}: Enter</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={`tab ${category === 'all' ? 'tab-active' : ''}`}
                onClick={() => setCategory('all')}
              >
                {t('common.all')}
              </button>
              {PRODUCT_CATEGORIES.filter((item) => item !== 'services').map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`tab ${category === item ? 'tab-active' : ''}`}
                  onClick={() => setCategory(item)}
                >
                  {t(`products.cat.${item}` as 'products.cat.frames')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((product) => {
              const out = product.quantity <= 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={out}
                  onClick={() => addToCart(product)}
                  className={`card flex flex-col gap-2 p-3 text-start transition ${
                    out ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-0.5 hover:shadow-pop'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-800">
                        {pick(product.nameAr, product.nameEn)}
                      </span>
                      <span className="block font-mono text-[11px] text-slate-400">{product.sku}</span>
                    </span>
                    <span className="shrink-0 rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">
                      {money(product.price)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge tone="gray">{t(`products.cat.${product.category}` as 'products.cat.frames')}</Badge>
                    {product.brand && <Badge tone="blue">{product.brand}</Badge>}
                    {product.size && <Badge tone="violet">{product.size}</Badge>}
                  </span>
                  <span className="text-xs">
                    {out ? (
                      <Badge tone="red">{t('products.outOfStock')}</Badge>
                    ) : product.quantity <= (product.minQuantity || settings.lowStockThreshold) ? (
                      <Badge tone="amber">
                        {t('pos.stockAvailable', { count: num(product.quantity) })}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">
                        {t('pos.stockAvailable', { count: num(product.quantity) })}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {results.length === 0 && (
              <div className="card card-pad sm:col-span-2 lg:col-span-3">
                <p className="py-8 text-center text-sm text-slate-400">{t('common.noResults')}</p>
              </div>
            )}
          </div>

          {serviceProducts.length > 0 && (
            <div className="card card-pad">
              <p className="section-title">{t('products.cat.services')}</p>
              <div className="flex flex-wrap gap-2">
                {serviceProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => addToCart(product)}
                  >
                    {pick(product.nameAr, product.nameEn)} · {money(product.price)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="card card-pad">
            <p className="section-title">{t('pos.customer')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="select flex-1"
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setPrescriptionId('');
                }}
              >
                <option value="">{t('pos.walkIn')}</option>
                {customers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.phone}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setCustomerModalOpen(true)}>
                ➕ {t('common.new')}
              </button>
            </div>

            {customer && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone="brand">{customer.code}</Badge>
                <span dir="ltr">{customer.phone}</span>
                <Badge tone="amber">
                  {t('customers.loyaltyPoints')}: {num(customer.loyaltyPoints)}
                </Badge>
                <button type="button" className="link" onClick={() => setCustomerId('')}>
                  {t('pos.clearCustomer')}
                </button>
              </div>
            )}

            {customerId && (
              <div className="mt-3">
                <Field label={t('pos.attachPrescription')}>
                  <select
                    className="select"
                    value={prescriptionId}
                    onChange={(event) => setPrescriptionId(event.target.value)}
                  >
                    <option value="">{t('pos.noPrescription')}</option>
                    {customerPrescriptions.map((prescription) => (
                      <option key={prescription.id} value={prescription.id}>
                        {prescription.number} · {date(prescription.date)} ·{' '}
                        {t(`prescriptions.type.${prescription.type}` as 'prescriptions.type.distance')}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div className="card">
            <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="card-title">
                {t('pos.cart')} <span className="text-slate-400">({num(cart.length)})</span>
              </h2>
              {cart.length > 0 && (
                <button type="button" className="btn-ghost btn-sm" onClick={clearCart}>
                  🗑️ {t('pos.clearCart')}
                </button>
              )}
            </header>

            <div className="max-h-[40vh] overflow-y-auto px-4 py-3">
              {cart.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">{t('pos.emptyCart')}</p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((line) => (
                    <li key={line.lineId} className="rounded-xl border border-slate-100 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">
                            {pick(line.product.nameAr, line.product.nameEn)}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400">{line.product.sku}</p>
                          {line.lensOptions && (
                            <p className="text-[11px] text-brand-700">
                              {t('pos.lensOptions')}: {line.lensOptions.index ?? ''}{' '}
                              {(line.lensOptions.coating ?? [])
                                .map((key) => t(`lab.coatings.${key}` as 'lab.coatings.antiReflective'))
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn-icon hover:bg-rose-50 hover:text-rose-600"
                          title={t('pos.removeItem')}
                          onClick={() => removeLine(line.lineId)}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => updateLine(line.lineId, { quantity: Math.max(line.quantity - 1, 1) })}
                          >
                            −
                          </button>
                          <input
                            className="input w-16 py-1 text-center"
                            dir="ltr"
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(line.lineId, {
                                quantity: Math.max(Number(event.target.value) || 1, 1),
                              })
                            }
                          />
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => updateLine(line.lineId, { quantity: line.quantity + 1 })}
                          >
                            +
                          </button>
                        </div>

                        <input
                          className="input w-24 py-1 text-center"
                          dir="ltr"
                          type="number"
                          step={0.01}
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(line.lineId, { unitPrice: Number(event.target.value) || 0 })
                          }
                        />

                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          title={t('pos.lensOptions')}
                          onClick={() => setOptionsLine(line)}
                        >
                          👁️
                        </button>

                        <span className="ms-auto text-sm font-bold tabular-nums text-slate-800">
                          {money(round2(line.quantity * line.unitPrice))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-100 px-4 py-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{t('common.subtotal')}</span>
                  <span className="font-semibold tabular-nums">{money(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{t('pos.orderDiscount')}</span>
                  <input
                    className="input w-28 py-1 text-center"
                    dir="ltr"
                    type="number"
                    min={0}
                    step={0.01}
                    value={invoiceDiscount}
                    onChange={(event) => setInvoiceDiscount(event.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {t('common.vat')} ({num(settings.taxRate)}%)
                  </span>
                  <span className="font-semibold tabular-nums">{money(totals.taxAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base">
                  <span className="font-bold text-slate-700">{t('common.grandTotal')}</span>
                  <span className="text-lg font-extrabold tabular-nums text-brand-800">{money(totals.total)}</span>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t('common.method')}>
                  <select
                    className="select"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t(`pos.method.${method}` as 'pos.method.cash')}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('pos.amountPaid')}>
                  <input
                    className="input"
                    dir="ltr"
                    type="number"
                    step={0.01}
                    value={amountPaid}
                    placeholder={String(totals.total)}
                    onChange={(event) => setAmountPaid(event.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-500">
                  {t('pos.changeDue')}:{' '}
                  <span className="font-bold text-emerald-600">{money(change)}</span>
                </span>
                <span className="text-slate-500">
                  {t('pos.remainingDue')}:{' '}
                  <span className="font-bold text-rose-600">{money(remaining)}</span>
                </span>
                {remaining > 0 && <Badge tone="amber">{t('pos.partialPaymentHint')}</Badge>}
              </div>

              {needsLabOrder && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={createLab}
                    onChange={(event) => setCreateLab(event.target.checked)}
                  />
                  {t('nav.labOrders')}
                </label>
              )}

              <Field label={t('pos.notes')}>
                <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1 py-2.5"
                  disabled={cart.length === 0}
                  onClick={() => completeSale(false)}
                >
                  ✅ {t('pos.completeSale')}
                </button>
                <button
                  type="button"
                  className="btn-secondary py-2.5"
                  disabled={cart.length === 0}
                  onClick={() => completeSale(true)}
                >
                  🖨️ {t('common.print')}
                </button>
              </div>
            </div>

          </div>

        </aside>

      </div>

      <LensOptionsModal
        line={optionsLine}
        onClose={() => setOptionsLine(null)}
        onSave={(lineId, options, unitPrice) => updateLine(lineId, { lensOptions: options, unitPrice })}
      />
      <CustomerFormModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onCreated={(created) => setCustomerId(created.id)}
      />
    </div>
  );
}


