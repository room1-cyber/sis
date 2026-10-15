import { useEffect, useMemo, useState } from 'react';
import type { EyeRefraction, Prescription, RxType } from '@/types';
import { useData } from '@/store/DataContext';
import { useI18n } from '@/i18n';
import { Field, Modal } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { atNoon, toDateInput, todayInput } from '@/lib/date';

const EMPTY_EYE: EyeRefraction = { sph: null, cyl: null, axis: null, add: null, va: '' };

interface FormState {
  customerId: string;
  date: string;
  type: RxType;
  doctorName: string;
  clinic: string;
  od: EyeRefraction;
  os: EyeRefraction;
  pd: string;
  pdNear: string;
  segmentHeight: string;
  diagnosis: string;
  notes: string;
  nextVisit: string;
}

const EMPTY: FormState = {
  customerId: '',
  date: todayInput(),
  type: 'distance',
  doctorName: '',
  clinic: '',
  od: { ...EMPTY_EYE },
  os: { ...EMPTY_EYE },
  pd: '',
  pdNear: '',
  segmentHeight: '',
  diagnosis: '',
  notes: '',
  nextVisit: '',
};

const RX_TYPES: RxType[] = ['distance', 'reading', 'bifocal', 'progressive', 'contact'];

function toNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toState(prescription?: Prescription | null, customerId?: string): FormState {
  if (!prescription) return { ...EMPTY, customerId: customerId ?? '' };
  return {
    customerId: prescription.customerId,
    date: toDateInput(prescription.date),
    type: prescription.type,
    doctorName: prescription.doctorName,
    clinic: prescription.clinic ?? '',
    od: { ...prescription.od },
    os: { ...prescription.os },
    pd: prescription.pd === null ? '' : String(prescription.pd),
    pdNear: prescription.pdNear === null ? '' : String(prescription.pdNear),
    segmentHeight: prescription.segmentHeight === null ? '' : String(prescription.segmentHeight),
    diagnosis: prescription.diagnosis ?? '',
    notes: prescription.notes ?? '',
    nextVisit: toDateInput(prescription.nextVisit),
  };
}

/** Create / edit dialog for a refraction prescription (OD / OS grid). */
export function PrescriptionFormModal({
  open,
  onClose,
  prescription,
  customerId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  prescription?: Prescription | null;
  customerId?: string;
  onSaved?: (prescription: Prescription) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { customers, addPrescription, updatePrescription, prescriptions } = useData();
  const [form, setForm] = useState<FormState>(toState(prescription, customerId));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(toState(prescription, customerId));
      setErrors({});
    }
  }, [open, prescription, customerId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setEye = (eye: 'od' | 'os', key: keyof EyeRefraction, value: string) =>
    setForm((current) => ({
      ...current,
      [eye]: { ...current[eye], [key]: key === 'va' ? value : toNumber(value) },
    }));

  const sortedCustomers = useMemo(
    () => customers.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [customers],
  );

  const customerPrescriptions = useMemo(
    () => prescriptions.filter((item) => item.customerId === form.customerId).length,
    [prescriptions, form.customerId],
  );

  const submit = () => {
    const next: Record<string, string> = {};
    if (!form.customerId) next.customerId = t('validation.selectCustomer');
    if (!form.doctorName.trim()) next.doctorName = t('validation.required');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      customerId: form.customerId,
      date: atNoon(form.date),
      type: form.type,
      doctorName: form.doctorName.trim(),
      clinic: form.clinic.trim() || undefined,
      od: form.od,
      os: form.os,
      pd: toNumber(form.pd),
      pdNear: toNumber(form.pdNear),
      segmentHeight: toNumber(form.segmentHeight),
      diagnosis: form.diagnosis.trim() || undefined,
      notes: form.notes.trim() || undefined,
      nextVisit: form.nextVisit ? atNoon(form.nextVisit) : undefined,
    };

    if (prescription) {
      updatePrescription(prescription.id, payload);
      toast.success(t('prescriptions.created'));
    } else {
      const created = addPrescription(payload);
      toast.success(t('prescriptions.created'));
      onSaved?.(created);
    }
    onClose();
  };

  const eyeRow = (label: string, key: keyof EyeRefraction, step = 0.25, placeholder = '') => (
    <tr key={String(key)}>
      <th className="whitespace-nowrap px-2 py-1.5 text-start text-xs font-bold text-slate-500">{label}</th>
      {(['od', 'os'] as const).map((eye) => (
        <td key={eye} className="px-1 py-1">
          <input
            className="input py-1.5 text-center"
            dir="ltr"
            type={key === 'va' ? 'text' : 'number'}
            step={key === 'va' ? undefined : step}
            placeholder={placeholder}
            value={form[eye][key] === null || form[eye][key] === undefined ? '' : String(form[eye][key])}
            onChange={(event) => setEye(eye, key, event.target.value)}
          />
        </td>
      ))}
    </tr>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={prescription ? t('prescriptions.edit') : t('prescriptions.new')}
      subtitle={prescription ? prescription.number : undefined}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('prescriptions.customer')}
            required
            error={errors.customerId}
            hint={form.customerId ? `${t('customers.prescriptionsCount')}: ${customerPrescriptions}` : undefined}
          >
            <select
              className="select"
              value={form.customerId}
              onChange={(event) => set('customerId', event.target.value)}
            >
              <option value="">{t('prescriptions.selectCustomer')}</option>
              {sortedCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} — {customer.phone}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('common.date')} required>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(event) => set('date', event.target.value)}
            />
          </Field>
          <Field label={t('prescriptions.type')}>
            <select
              className="select"
              value={form.type}
              onChange={(event) => set('type', event.target.value as RxType)}
            >
              {RX_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`prescriptions.type.${type}` as 'prescriptions.type.distance')}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('prescriptions.doctor')} required error={errors.doctorName}>
            <input
              className="input"
              value={form.doctorName}
              onChange={(event) => set('doctorName', event.target.value)}
            />
          </Field>
          <Field label={t('prescriptions.clinic')} className="sm:col-span-2">
            <input className="input" value={form.clinic} onChange={(event) => set('clinic', event.target.value)} />
          </Field>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-2 py-2 text-start text-xs font-bold uppercase text-slate-500">
                  {t('prescriptions.refractionTable')}
                </th>
                <th className="px-2 py-2 text-center text-xs font-bold uppercase text-slate-500">
                  {t('prescriptions.od')}
                </th>
                <th className="px-2 py-2 text-center text-xs font-bold uppercase text-slate-500">
                  {t('prescriptions.os')}
                </th>
              </tr>
            </thead>
            <tbody>
              {eyeRow(t('prescriptions.sph'), 'sph', 0.25, '-1.25')}
              {eyeRow(t('prescriptions.cyl'), 'cyl', 0.25, '-0.50')}
              {eyeRow(t('prescriptions.axis'), 'axis', 1, '90')}
              {eyeRow(t('prescriptions.add'), 'add', 0.25, '+2.00')}
              {eyeRow(t('prescriptions.va'), 'va')}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('prescriptions.pd')}>
            <input
              className="input"
              dir="ltr"
              type="number"
              step={0.5}
              value={form.pd}
              onChange={(event) => set('pd', event.target.value)}
            />
          </Field>
          <Field label={t('prescriptions.pdNear')}>
            <input
              className="input"
              dir="ltr"
              type="number"
              step={0.5}
              value={form.pdNear}
              onChange={(event) => set('pdNear', event.target.value)}
            />
          </Field>
          <Field label={t('prescriptions.segmentHeight')}>
            <input
              className="input"
              dir="ltr"
              type="number"
              step={0.5}
              value={form.segmentHeight}
              onChange={(event) => set('segmentHeight', event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prescriptions.diagnosis')}>
            <input
              className="input"
              value={form.diagnosis}
              onChange={(event) => set('diagnosis', event.target.value)}
            />
          </Field>
          <Field label={t('prescriptions.nextVisit')}>
            <input
              type="date"
              className="input"
              value={form.nextVisit}
              onChange={(event) => set('nextVisit', event.target.value)}
            />
          </Field>
        </div>

        <Field label={t('common.notes')}>
          <textarea
            className="textarea"
            placeholder={t('prescriptions.notesPlaceholder')}
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
          />
        </Field>

      </div>
    </Modal>
  );
}

