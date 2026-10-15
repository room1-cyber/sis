import { useEffect, useState } from 'react';
import type { Customer, Gender } from '@/types';
import { useData } from '@/store/DataContext';
import { useI18n } from '@/i18n';
import { Field, Modal } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { atNoon, toDateInput } from '@/lib/date';

interface CustomerFormState {
  name: string;
  nameEn: string;
  phone: string;
  altPhone: string;
  email: string;
  gender: Gender | '';
  birthDate: string;
  city: string;
  address: string;
  occupation: string;
  insuranceCompany: string;
  insuranceNumber: string;
  notes: string;
}

const EMPTY: CustomerFormState = {
  name: '',
  nameEn: '',
  phone: '',
  altPhone: '',
  email: '',
  gender: '',
  birthDate: '',
  city: '',
  address: '',
  occupation: '',
  insuranceCompany: '',
  insuranceNumber: '',
  notes: '',
};

function toState(customer?: Customer | null): CustomerFormState {
  if (!customer) return { ...EMPTY };
  return {
    name: customer.name,
    nameEn: customer.nameEn ?? '',
    phone: customer.phone,
    altPhone: customer.altPhone ?? '',
    email: customer.email ?? '',
    gender: customer.gender ?? '',
    birthDate: toDateInput(customer.birthDate),
    city: customer.city ?? '',
    address: customer.address ?? '',
    occupation: customer.occupation ?? '',
    insuranceCompany: customer.insuranceCompany ?? '',
    insuranceNumber: customer.insuranceNumber ?? '',
    notes: customer.notes ?? '',
  };
}

/** Create / edit dialog shared by the customers page, POS and appointments. */
export function CustomerFormModal({
  open,
  onClose,
  customer,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onCreated?: (customer: Customer) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { addCustomer, updateCustomer } = useData();
  const [form, setForm] = useState<CustomerFormState>(toState(customer));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(toState(customer));
      setErrors({});
    }
  }, [open, customer]);

  const set = <K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t('validation.required');
    if (!form.phone.trim()) next.phone = t('validation.required');
    else if (form.phone.replace(/\D/g, '').length < 7) next.phone = t('validation.invalidPhone');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = t('validation.invalidEmail');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const payload = {
      name: form.name.trim(),
      nameEn: form.nameEn.trim() || undefined,
      phone: form.phone.trim(),
      altPhone: form.altPhone.trim() || undefined,
      email: form.email.trim() || undefined,
      gender: (form.gender || undefined) as Gender | undefined,
      birthDate: form.birthDate ? atNoon(form.birthDate) : undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      occupation: form.occupation.trim() || undefined,
      insuranceCompany: form.insuranceCompany.trim() || undefined,
      insuranceNumber: form.insuranceNumber.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    if (customer) {
      updateCustomer(customer.id, payload);
      toast.success(t('customers.updated'));
    } else {
      const created = addCustomer({ ...payload, loyaltyPoints: 0 });
      toast.success(t('customers.created'));
      onCreated?.(created);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={customer ? t('customers.edit') : t('customers.new')}
      subtitle={customer ? customer.code : undefined}
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
        <Field label={t('customers.name')} required error={errors.name} className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label={t('customers.nameEn')}>
          <input
            className="input"
            dir="ltr"
            value={form.nameEn}
            onChange={(event) => set('nameEn', event.target.value)}
          />
        </Field>
        <Field label={t('customers.gender')}>
          <select
            className="select"
            value={form.gender}
            onChange={(event) => set('gender', event.target.value as Gender | '')}
          >
            <option value="">{t('common.notSpecified')}</option>
            <option value="male">{t('customers.male')}</option>
            <option value="female">{t('customers.female')}</option>
            <option value="other">{t('customers.other')}</option>
          </select>
        </Field>
        <Field label={t('common.phone')} required error={errors.phone}>
          <input
            className="input"
            dir="ltr"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
          />
        </Field>
        <Field label={t('customers.altPhone')}>
          <input
            className="input"
            dir="ltr"
            value={form.altPhone}
            onChange={(event) => set('altPhone', event.target.value)}
          />
        </Field>
        <Field label={t('common.email')} error={errors.email}>
          <input
            className="input"
            dir="ltr"
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
          />
        </Field>
        <Field label={t('customers.birthDate')}>
          <input
            type="date"
            className="input"
            value={form.birthDate}
            onChange={(event) => set('birthDate', event.target.value)}
          />
        </Field>
        <Field label={t('customers.city')}>
          <input className="input" value={form.city} onChange={(event) => set('city', event.target.value)} />
        </Field>
        <Field label={t('customers.occupation')}>
          <input
            className="input"
            value={form.occupation}
            onChange={(event) => set('occupation', event.target.value)}
          />
        </Field>
        <Field label={t('customers.address')} className="sm:col-span-2">
          <input className="input" value={form.address} onChange={(event) => set('address', event.target.value)} />
        </Field>
        <Field label={t('customers.insuranceCompany')}>
          <input
            className="input"
            value={form.insuranceCompany}
            onChange={(event) => set('insuranceCompany', event.target.value)}
          />
        </Field>
        <Field label={t('customers.insuranceNumber')}>
          <input
            className="input"
            dir="ltr"
            value={form.insuranceNumber}
            onChange={(event) => set('insuranceNumber', event.target.value)}
          />
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <textarea className="textarea" value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

