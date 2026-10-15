import type { User } from '@/types';
import type { TranslationKey } from '@/i18n/ar';

/* ---------------------------------------------------------------------------
 * Role based permissions.
 * A single place to decide what every role can do; `App.tsx` guards routes and
 * the navigation menu is filtered with the same matrix.
 * ------------------------------------------------------------------------- */

export type Permission =
  | 'dashboard.view'
  | 'pos.use'
  | 'invoices.view'
  | 'invoices.create'
  | 'invoices.edit'
  | 'invoices.delete'
  | 'returns.manage'
  | 'customers.view'
  | 'customers.manage'
  | 'prescriptions.view'
  | 'prescriptions.manage'
  | 'appointments.view'
  | 'appointments.manage'
  | 'labOrders.view'
  | 'labOrders.manage'
  | 'products.view'
  | 'products.manage'
  | 'stock.manage'
  | 'suppliers.view'
  | 'suppliers.manage'
  | 'purchases.view'
  | 'purchases.manage'
  | 'reports.view'
  | 'reports.financial'
  | 'users.manage'
  | 'settings.manage'
  | 'data.manage';

const MATRIX: Record<User['role'], Permission[]> = {
  admin: [
    'dashboard.view',
    'pos.use',
    'invoices.view',
    'invoices.create',
    'invoices.edit',
    'invoices.delete',
    'returns.manage',
    'customers.view',
    'customers.manage',
    'prescriptions.view',
    'prescriptions.manage',
    'appointments.view',
    'appointments.manage',
    'labOrders.view',
    'labOrders.manage',
    'products.view',
    'products.manage',
    'stock.manage',
    'suppliers.view',
    'suppliers.manage',
    'purchases.view',
    'purchases.manage',
    'reports.view',
    'reports.financial',
    'users.manage',
    'settings.manage',
    'data.manage',
  ],
  manager: [
    'dashboard.view',
    'pos.use',
    'invoices.view',
    'invoices.create',
    'invoices.edit',
    'returns.manage',
    'customers.view',
    'customers.manage',
    'prescriptions.view',
    'prescriptions.manage',
    'appointments.view',
    'appointments.manage',
    'labOrders.view',
    'labOrders.manage',
    'products.view',
    'products.manage',
    'stock.manage',
    'suppliers.view',
    'suppliers.manage',
    'purchases.view',
    'purchases.manage',
    'reports.view',
    'reports.financial',
  ],
  cashier: [
    'dashboard.view',
    'pos.use',
    'invoices.view',
    'invoices.create',
    'returns.manage',
    'customers.view',
    'customers.manage',
    'prescriptions.view',
    'appointments.view',
    'appointments.manage',
    'labOrders.view',
    'products.view',
  ],
  optometrist: [
    'dashboard.view',
    'customers.view',
    'customers.manage',
    'prescriptions.view',
    'prescriptions.manage',
    'appointments.view',
    'appointments.manage',
    'labOrders.view',
    'labOrders.manage',
    'products.view',
    'invoices.view',
  ],
};

export function can(user: User | null | undefined, permission: Permission): boolean {
  if (!user || !user.active) return false;
  return MATRIX[user.role].includes(permission);
}

export function canAny(user: User | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(user, permission));
}

export function permissionsOf(role: User['role']): Permission[] {
  return [...MATRIX[role]];
}

export const ROLES: User['role'][] = ['admin', 'manager', 'cashier', 'optometrist'];

export const ROLE_LABEL_KEY: Record<User['role'], TranslationKey> = {
  admin: 'auth.role.admin',
  manager: 'auth.role.manager',
  cashier: 'auth.role.cashier',
  optometrist: 'auth.role.optometrist',
};

export const PERMISSION_LABEL_KEY: Record<Permission, TranslationKey> = {
  'dashboard.view': 'users.perm.dashboard',
  'pos.use': 'users.perm.pos',
  'invoices.view': 'users.perm.invoicesView',
  'invoices.create': 'users.perm.invoicesCreate',
  'invoices.edit': 'users.perm.invoicesEdit',
  'invoices.delete': 'users.perm.invoicesDelete',
  'returns.manage': 'users.perm.returns',
  'customers.view': 'users.perm.customersView',
  'customers.manage': 'users.perm.customersManage',
  'prescriptions.view': 'users.perm.prescriptionsView',
  'prescriptions.manage': 'users.perm.prescriptionsManage',
  'appointments.view': 'users.perm.appointmentsView',
  'appointments.manage': 'users.perm.appointmentsManage',
  'labOrders.view': 'users.perm.labView',
  'labOrders.manage': 'users.perm.labManage',
  'products.view': 'users.perm.productsView',
  'products.manage': 'users.perm.productsManage',
  'stock.manage': 'users.perm.stock',
  'suppliers.view': 'users.perm.suppliersView',
  'suppliers.manage': 'users.perm.suppliersManage',
  'purchases.view': 'users.perm.purchasesView',
  'purchases.manage': 'users.perm.purchasesManage',
  'reports.view': 'users.perm.reportsView',
  'reports.financial': 'users.perm.reportsFinancial',
  'users.manage': 'users.perm.users',
  'settings.manage': 'users.perm.settings',
  'data.manage': 'users.perm.data',
};
