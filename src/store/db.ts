import type { AppSettings, BackupFile, Database, User } from '@/types';

/* ---------------------------------------------------------------------------
 * Persistence layer.
 * The whole database is kept in a single localStorage key as JSON. Keeping it
 * in one place makes backup / restore and "reset data" trivial.
 * ------------------------------------------------------------------------- */

export const STORAGE_KEY = 'optic-store-manager:db:v1';
export const DB_VERSION = 1;

export function defaultSettings(): AppSettings {
  return {
    storeNameAr: 'نظارات البصيرة',
    storeNameEn: 'Al Basira Optics',
    phone: '011 456 7890',
    email: 'info@albasira-optics.com',
    addressAr: 'شارع الملك فهد، حي العليا، الرياض',
    addressEn: 'King Fahd Road, Al Olaya, Riyadh',
    taxNumber: '300123456700003',
    crNumber: '1010123456',
    currency: 'SAR',
    taxRate: 15,
    pricesIncludeTax: false,
    language: 'ar',
    hijriDates: false,
    arabicNumerals: false,
    lowStockThreshold: 3,
    expiryWarningDays: 30,
    loyaltyPointsPerCurrency: 1,
    loyaltyPointValue: 0.05,
    invoiceFooterAr: 'شكراً لثقتكم بنا — الضمان لا يشمل الكسر أو سوء الاستخدام.',
    invoiceFooterEn: 'Thank you for your trust — warranty excludes breakage or misuse.',
    invoicePrefix: 'INV',
    labOrderPrefix: 'LAB',
    purchasePrefix: 'PO',
    prescriptionPrefix: 'RX',
    customerPrefix: 'CUS',
    supplierPrefix: 'SUP',
    returnPrefix: 'RET',
    counters: {
      invoices: 1000,
      labOrders: 500,
      purchases: 200,
      prescriptions: 700,
      customers: 1000,
      suppliers: 100,
      returns: 300,
      stockMovements: 0,
    },
  };
}

export function createEmptyDatabase(settings?: AppSettings, users?: User[]): Database {
  return {
    version: DB_VERSION,
    users: users ?? [],
    customers: [],
    prescriptions: [],
    products: [],
    suppliers: [],
    invoices: [],
    returns: [],
    labOrders: [],
    purchases: [],
    appointments: [],
    stockMovements: [],
    settings: settings ?? defaultSettings(),
  };
}

/** Fills in any missing collection / setting so older backups keep working. */
export function migrateDatabase(input: Partial<Database> | null | undefined): Database {
  const base = createEmptyDatabase();
  if (!input || typeof input !== 'object') return base;
  return {
    version: DB_VERSION,
    users: Array.isArray(input.users) ? input.users : [],
    customers: Array.isArray(input.customers) ? input.customers : [],
    prescriptions: Array.isArray(input.prescriptions) ? input.prescriptions : [],
    products: Array.isArray(input.products) ? input.products : [],
    suppliers: Array.isArray(input.suppliers) ? input.suppliers : [],
    invoices: Array.isArray(input.invoices) ? input.invoices : [],
    returns: Array.isArray(input.returns) ? input.returns : [],
    labOrders: Array.isArray(input.labOrders) ? input.labOrders : [],
    purchases: Array.isArray(input.purchases) ? input.purchases : [],
    appointments: Array.isArray(input.appointments) ? input.appointments : [],
    stockMovements: Array.isArray(input.stockMovements) ? input.stockMovements : [],
    settings: {
      ...base.settings,
      ...(input.settings ?? {}),
      counters: { ...base.settings.counters, ...(input.settings?.counters ?? {}) },
    },
  };
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDatabase(): Database | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrateDatabase(JSON.parse(raw) as Partial<Database>);
  } catch {
    return null;
  }
}

export function saveDatabase(db: Database): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function clearDatabase(): void {
  safeStorage()?.removeItem(STORAGE_KEY);
}

/** Approximate size of the persisted payload in bytes (for the settings page). */
export function storageSize(): number {
  const storage = safeStorage();
  if (!storage) return 0;
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? new Blob([raw]).size : 0;
}

export function buildBackup(db: Database, exportedBy: string): BackupFile {
  return {
    app: 'optic-store-manager',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    data: db,
  };
}

/** Parses and validates an uploaded backup file. Throws on invalid content. */
export function parseBackup(text: string): Database {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }
  const candidate = parsed as Partial<BackupFile> & Partial<Database>;
  const payload = (candidate.data ?? candidate) as Partial<Database>;
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.products)) {
    throw new Error('INVALID_BACKUP');
  }
  return migrateDatabase(payload);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

/** Exports an array of objects to CSV and triggers a download. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    downloadJson(filename.replace(/\.csv$/, '.json'), []);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\r\n');
  // BOM keeps Arabic readable when the file is opened in Excel.
  triggerDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), filename);
}

