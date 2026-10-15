import { useEffect, useState } from 'react';
import type { Product, ProductCategory, ProductGender } from '@/types';
import { useData } from '@/store/DataContext';
import { useI18n } from '@/i18n';
import { Field, Modal } from '@/components/ui';
import { useToast } from '@/components/feedback';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'frames',
  'sunglasses',
  'lenses',
  'contact_lenses',
  'solutions',
  'accessories',
  'services',
];

const GENDERS: ProductGender[] = ['men', 'women', 'kids', 'unisex'];

interface FormState {
  sku: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  category: ProductCategory;
  brand: string;
  model: string;
  color: string;
  size: string;
  material: string;
  gender: ProductGender | '';
  price: string;
  cost: string;
  quantity: string;
  minQuantity: string;
  supplierId: string;
  location: string;
  warrantyMonths: string;
  active: boolean;
  notes: string;
}

const EMPTY: FormState = {
  sku: '',
  barcode: '',
  nameAr: '',
  nameEn: '',
  category: 'frames',
  brand: '',
  model: '',
  color: '',
  size: '',
  material: '',
  gender: '',
  price: '',
  cost: '',
  quantity: '0',
  minQuantity: '1',
  supplierId: '',
  location: '',
  warrantyMonths: '0',
  active: true,
  notes: '',
};

function toState(product?: Product | null): FormState {
  if (!product) return { ...EMPTY };
  return {
    sku: product.sku,
    barcode: product.barcode ?? '',
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    category: product.category,
    brand: product.brand ?? '',
    model: product.model ?? '',
    color: product.color ?? '',
    size: product.size ?? '',
    material: product.material ?? '',
    gender: product.gender ?? '',
    price: String(product.price),
    cost: String(product.cost),
    quantity: String(product.quantity),
    minQuantity: String(product.minQuantity),
    supplierId: product.supplierId ?? '',
    location: product.location ?? '',
    warrantyMonths: String(product.warrantyMonths),
    active: product.active,
    notes: product.notes ?? '',
  };
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Create / edit dialog for a catalog product. */
export function ProductFormModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { addProduct, updateProduct, products, suppliers } = useData();
  const [form, setForm] = useState<FormState>(toState(product));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(toState(product));
      setErrors({});
    }
  }, [open, product]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.sku.trim()) next.sku = t('validation.required');
    else if (
      products.some(
        (item) => item.sku.toLowerCase() === form.sku.trim().toLowerCase() && item.id !== product?.id,
      )
    )
      next.sku = t('validation.duplicateSku');
    if (!form.nameAr.trim()) next.nameAr = t('validation.required');
    if (numberOrZero(form.price) <= 0) next.price = t('validation.positiveNumber');
    if (numberOrZero(form.cost) < 0) next.cost = t('validation.minZero');
    if (form.barcode.trim() && products.some((item) => item.barcode === form.barcode.trim() && item.id !== product?.id))
      next.barcode = t('validation.duplicateBarcode');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const payload = {
      sku: form.sku.trim().toUpperCase(),
      barcode: form.barcode.trim() || undefined,
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || form.nameAr.trim(),
      category: form.category,
      brand: form.brand.trim() || undefined,
      model: form.model.trim() || undefined,
      color: form.color.trim() || undefined,
      size: form.size.trim() || undefined,
      material: form.material.trim() || undefined,
      gender: (form.gender || undefined) as ProductGender | undefined,
      price: numberOrZero(form.price),
      cost: numberOrZero(form.cost),
      quantity: numberOrZero(form.quantity),
      minQuantity: numberOrZero(form.minQuantity),
      supplierId: form.supplierId || undefined,
      location: form.location.trim() || undefined,
      warrantyMonths: numberOrZero(form.warrantyMonths),
      active: form.active,
      notes: form.notes.trim() || undefined,
    };

    if (product) {
      updateProduct(product.id, payload);
      toast.success(t('products.updated'));
    } else {
      addProduct(payload);
      toast.success(t('products.created'));
    }
    onClose();
  };

  const margin =
    numberOrZero(form.price) > 0
      ? ((numberOrZero(form.price) - numberOrZero(form.cost)) / numberOrZero(form.price)) * 100
      : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? t('products.edit') : t('products.new')}
      subtitle={product ? product.sku : undefined}
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
        <Field label={t('products.nameAr')} required error={errors.nameAr} className="sm:col-span-2">
          <input className="input" value={form.nameAr} onChange={(event) => set('nameAr', event.target.value)} />
        </Field>
        <Field label={t('products.nameEn')}>
          <input
            className="input"
            dir="ltr"
            value={form.nameEn}
            onChange={(event) => set('nameEn', event.target.value)}
          />
        </Field>
        <Field label={t('common.sku')} required error={errors.sku}>
          <input className="input" dir="ltr" value={form.sku} onChange={(event) => set('sku', event.target.value)} />
        </Field>
        <Field label={t('common.barcode')} error={errors.barcode}>
          <input
            className="input"
            dir="ltr"
            value={form.barcode}
            onChange={(event) => set('barcode', event.target.value)}
          />
        </Field>
        <Field label={t('products.category')} required>
          <select
            className="select"
            value={form.category}
            onChange={(event) => set('category', event.target.value as ProductCategory)}
          >
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`products.cat.${category}` as 'products.cat.frames')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.brand')}>
          <input className="input" value={form.brand} onChange={(event) => set('brand', event.target.value)} />
        </Field>
        <Field label={t('common.model')}>
          <input className="input" value={form.model} onChange={(event) => set('model', event.target.value)} />
        </Field>
        <Field label={t('products.gender')}>
          <select
            className="select"
            value={form.gender}
            onChange={(event) => set('gender', event.target.value as ProductGender | '')}
          >
            <option value="">{t('common.notSpecified')}</option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {t(`products.gender.${gender}` as 'products.gender.men')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.color')}>
          <input className="input" value={form.color} onChange={(event) => set('color', event.target.value)} />
        </Field>
        <Field label={t('common.size')} hint={t('products.sizeHint')}>
          <input className="input" dir="ltr" value={form.size} onChange={(event) => set('size', event.target.value)} />
        </Field>
        <Field label={t('common.material')}>
          <input className="input" value={form.material} onChange={(event) => set('material', event.target.value)} />
        </Field>

        <Field label={t('products.supplier')}>
          <select
            className="select"
            value={form.supplierId}
            onChange={(event) => set('supplierId', event.target.value)}
          >
            <option value="">{t('common.none')}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('products.sellPrice')} required error={errors.price}>
          <input
            className="input"
            dir="ltr"
            type="number"
            step={0.01}
            value={form.price}
            onChange={(event) => set('price', event.target.value)}
          />
        </Field>
        <Field
          label={t('products.purchasePrice')}
          error={errors.cost}
          hint={`${t('products.marginPercent')}: ${margin.toFixed(1)}%`}
        >
          <input
            className="input"
            dir="ltr"
            type="number"
            step={0.01}
            value={form.cost}
            onChange={(event) => set('cost', event.target.value)}
          />
        </Field>
        <Field label={t('products.stock')} hint={product ? t('products.adjustStock') : undefined}>
          <input
            className="input"
            dir="ltr"
            type="number"
            value={form.quantity}
            disabled={Boolean(product)}
            onChange={(event) => set('quantity', event.target.value)}
          />
        </Field>
        <Field label={t('products.minQuantity')}>
          <input
            className="input"
            dir="ltr"
            type="number"
            value={form.minQuantity}
            onChange={(event) => set('minQuantity', event.target.value)}
          />
        </Field>
        <Field label={t('products.location')}>
          <input className="input" value={form.location} onChange={(event) => set('location', event.target.value)} />
        </Field>
        <Field label={t('products.warrantyMonths')}>
          <input
            className="input"
            dir="ltr"
            type="number"
            value={form.warrantyMonths}
            onChange={(event) => set('warrantyMonths', event.target.value)}
          />
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <textarea className="textarea" value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="checkbox"
            checked={form.active}
            onChange={(event) => set('active', event.target.checked)}
          />
          <span className="text-sm font-semibold text-slate-700">{t('common.active')}</span>
        </label>

      </div>
    </Modal>
  );
}

