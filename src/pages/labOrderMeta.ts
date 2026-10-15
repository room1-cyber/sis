import type { LabOrderStatus, PurchaseStatus } from '@/types';
import type { Tone } from '@/components/ui';

/* ---------------------------------------------------------------------------
 * Shared metadata for lab orders and purchases (status colours / options).
 * ------------------------------------------------------------------------- */

export const LAB_STATUS_TONE: Record<LabOrderStatus, Tone> = {
  draft: 'gray',
  sent_to_lab: 'blue',
  in_lab: 'amber',
  received: 'violet',
  ready: 'green',
  delivered: 'brand',
  cancelled: 'red',
};

export const LAB_STATUS_ORDER: LabOrderStatus[] = [
  'draft',
  'sent_to_lab',
  'in_lab',
  'received',
  'ready',
  'delivered',
  'cancelled',
];

export const LAB_ORDER_TYPES = [
  'distance',
  'reading',
  'bifocal',
  'progressive',
  'sunglasses',
  'lens_only',
  'repair',
] as const;

export const LAB_COATINGS = [
  'antiReflective',
  'blueLight',
  'scratchResistant',
  'uv400',
  'photochromic',
  'polarized',
  'hardCoat',
] as const;

export const LENS_INDEX_OPTIONS = ['1.50', '1.56', '1.60', '1.67', '1.74'];

export const PURCHASE_STATUS_TONE: Record<PurchaseStatus, Tone> = {
  draft: 'gray',
  ordered: 'blue',
  received: 'green',
  cancelled: 'red',
};
