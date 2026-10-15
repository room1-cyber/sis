/* ---------------------------------------------------------------------------
 * Domain model for the optical store management system.
 * All monetary values are plain numbers in the store currency (2 decimals).
 * All timestamps are ISO-8601 strings so they can be persisted as JSON.
 * ------------------------------------------------------------------------- */

export type ID = string;

export type Lang = 'ar' | 'en';

/** Roles map 1:1 to the permission matrix in `src/store/permissions.ts`. */
export type Role = 'admin' | 'manager' | 'cashier' | 'optometrist';

export interface User {
  id: ID;
  username: string;
  fullName: string;
  role: Role;
  /** SHA-256(password + salt) as lowercase hex. */
  passwordHash: string;
  salt: string;
  phone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export type Gender = 'male' | 'female' | 'other';

export interface Customer {
  id: ID;
  /** Human friendly sequential code, e.g. CUS-1001. */
  code: string;
  name: string;
  nameEn?: string;
  phone: string;
  altPhone?: string;
  email?: string;
  gender?: Gender;
  birthDate?: string;
  address?: string;
  city?: string;
  occupation?: string;
  insuranceCompany?: string;
  insuranceNumber?: string;
  loyaltyPoints: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Refraction values for a single eye. `null` means "not measured". */
export interface EyeRefraction {
  /** Sphere, diopters (-30 .. +30) */
  sph: number | null;
  /** Cylinder, diopters (-10 .. +10) */
  cyl: number | null;
  /** Axis, degrees (0 .. 180) */
  axis: number | null;
  /** Additional power for near vision / progressive. */
  add: number | null;
  /** Visual acuity as free text, e.g. "6/9" or "0.8". */
  va?: string;
}

export type RxType = 'distance' | 'reading' | 'bifocal' | 'progressive' | 'contact';

export interface Prescription {
  id: ID;
  /** Sequential number, e.g. RX-1001. */
  number: string;
  customerId: ID;
  date: string;
  type: RxType;
  doctorName: string;
  clinic?: string;
  od: EyeRefraction;
  os: EyeRefraction;
  /** Pupillary distance (mm) for distance vision. */
  pd: number | null;
  /** Pupillary distance for near vision, mainly for progressive lenses. */
  pdNear: number | null;
  /** Segment height (mm) used when fitting progressive lenses. */
  segmentHeight: number | null;
  diagnosis?: string;
  notes?: string;
  /** Suggested follow-up / re-examination date. */
  nextVisit?: string;
  createdAt: string;
}

export type ProductCategory =
  | 'frames'
  | 'sunglasses'
  | 'lenses'
  | 'contact_lenses'
  | 'solutions'
  | 'accessories'
  | 'services';

export type ProductGender = 'men' | 'women' | 'kids' | 'unisex';

export interface Product {
  id: ID;
  sku: string;
  barcode?: string;
  nameAr: string;
  nameEn: string;
  category: ProductCategory;
  brand?: string;
  model?: string;
  color?: string;
  /** Frame size, e.g. "52-18-145". */
  size?: string;
  material?: string;
  gender?: ProductGender;
  /** Selling price (VAT handled at the invoice level). */
  price: number;
  /** Last purchase cost, used for profit reporting. */
  cost: number;
  quantity: number;
  minQuantity: number;
  supplierId?: ID;
  location?: string;
  warrantyMonths: number;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: ID;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  /** Positive => the store owes the supplier. */
  balance: number;
  notes?: string;
  createdAt: string;
}

/** Extra lens / coating options attached to a sale line that needs glazing. */
export interface LensOptions {
  lensType?: string;
  index?: string;
  coating?: string[];
  tint?: string;
  /** Extra charge for the selected upgrade, already included in unitPrice. */
  upgradePrice?: number;
}

export interface SaleItem {
  id: ID;
  productId: ID;
  sku: string;
  nameAr: string;
  nameEn: string;
  category: ProductCategory;
  quantity: number;
  /** Final unit price after any per-line discount. */
  unitPrice: number;
  /** Catalog price before the line discount (kept for reporting). */
  listPrice: number;
  discount: number;
  unitCost: number;
  lensOptions?: LensOptions;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'insurance' | 'credit';

export type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'returned' | 'cancelled';

export interface PaymentRecord {
  id: ID;
  date: string;
  amount: number;
  method: PaymentMethod;
  userId: ID;
  note?: string;
}

export interface Invoice {
  id: ID;
  /** Sequential invoice number, e.g. INV-1001. */
  number: string;
  date: string;
  customerId?: ID;
  /** Snapshot of the customer name so historical invoices stay readable. */
  customerName: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paid: number;
  payments: PaymentRecord[];
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
  prescriptionId?: ID;
  labOrderId?: ID;
  insuranceCompany?: string;
  notes?: string;
  /** Total amount already refunded through returns. */
  refunded: number;
  userId: ID;
  userName: string;
  createdAt: string;
}

export interface ReturnLine {
  productId: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  amount: number;
}

export interface ReturnRecord {
  id: ID;
  number: string;
  invoiceId: ID;
  invoiceNumber: string;
  date: string;
  lines: ReturnLine[];
  amount: number;
  refundMethod: PaymentMethod;
  reason?: string;
  userId: ID;
  userName: string;
}

export type StockMovementType = 'in' | 'out' | 'adjust' | 'sale' | 'return' | 'purchase' | 'damage';

export interface StockMovement {
  id: ID;
  productId: ID;
  productName: string;
  type: StockMovementType;
  quantity: number;
  previousQty: number;
  newQty: number;
  reference?: string;
  reason?: string;
  userId: ID;
  userName: string;
  date: string;
}

export type LabOrderType =
  | 'distance'
  | 'reading'
  | 'bifocal'
  | 'progressive'
  | 'sunglasses'
  | 'lens_only'
  | 'repair';

export type LabOrderStatus =
  | 'draft'
  | 'sent_to_lab'
  | 'in_lab'
  | 'received'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export interface LabOrder {
  id: ID;
  number: string;
  customerId?: ID;
  customerName: string;
  customerPhone?: string;
  prescriptionId?: ID;
  orderType: LabOrderType;
  /** Frame supplied to the lab (product id, optional for lens-only orders). */
  frameProductId?: ID;
  frameDescription?: string;
  lensType?: string;
  lensIndex?: string;
  coating: string[];
  tint?: string;
  labName?: string;
  sentDate?: string;
  expectedDate?: string;
  receivedDate?: string;
  deliveredDate?: string;
  status: LabOrderStatus;
  total: number;
  deposit: number;
  notes?: string;
  technician: string;
  invoiceId?: ID;
  userId: ID;
  userName: string;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseLine {
  id: ID;
  productId: ID;
  sku: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  receivedQty: number;
  unitCost: number;
}

export interface Purchase {
  id: ID;
  number: string;
  supplierId: ID;
  supplierName: string;
  date: string;
  expectedDate?: string;
  receivedDate?: string;
  lines: PurchaseLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paid: number;
  status: PurchaseStatus;
  notes?: string;
  userId: ID;
  userName: string;
  createdAt: string;
}

export type AppointmentType = 'eye_exam' | 'fitting' | 'followup' | 'delivery' | 'repair' | 'consultation';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
  id: ID;
  customerId?: ID;
  customerName: string;
  phone?: string;
  date: string;
  time: string;
  durationMin: number;
  type: AppointmentType;
  doctorName?: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt: string;
}

export interface AppSettings {
  storeNameAr: string;
  storeNameEn: string;
  logoDataUrl?: string;
  phone: string;
  email: string;
  addressAr: string;
  addressEn: string;
  taxNumber: string;
  crNumber: string;
  /** ISO-4217 code, e.g. SAR / AED / EGP / USD. */
  currency: string;
  /** VAT / tax percentage, e.g. 15 for 15%. */
  taxRate: number;
  /** When true, product prices are treated as VAT-inclusive. */
  pricesIncludeTax: boolean;
  language: Lang;
  /** Display dates using the Hijri (Islamic) calendar. */
  hijriDates: boolean;
  /** Render numbers with Arabic-Indic digits (٠١٢٣) when the UI is Arabic. */
  arabicNumerals: boolean;
  lowStockThreshold: number;
  /** Days before a prescription re-examination date that we warn the user. */
  expiryWarningDays: number;
  loyaltyPointsPerCurrency: number;
  loyaltyPointValue: number;
  invoiceFooterAr: string;
  invoiceFooterEn: string;
  invoicePrefix: string;
  labOrderPrefix: string;
  purchasePrefix: string;
  prescriptionPrefix: string;
  customerPrefix: string;
  supplierPrefix: string;
  returnPrefix: string;
  /** Sequence counters, e.g. { invoices: 12, customers: 40 }. */
  counters: Record<string, number>;
}

/** Shape of the whole persisted database (also used for backup/restore). */
export interface Database {
  version: number;
  users: User[];
  customers: Customer[];
  prescriptions: Prescription[];
  products: Product[];
  suppliers: Supplier[];
  invoices: Invoice[];
  returns: ReturnRecord[];
  labOrders: LabOrder[];
  purchases: Purchase[];
  appointments: Appointment[];
  stockMovements: StockMovement[];
  settings: AppSettings;
}

export interface BackupFile {
  app: 'optic-store-manager';
  version: number;
  exportedAt: string;
  exportedBy: string;
  data: Database;
}

/* ----------------------------- UI helpers -------------------------------- */

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface CartLine {
  lineId: ID;
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
  lensOptions?: LensOptions;
}


