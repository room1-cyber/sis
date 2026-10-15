import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AppSettings,
  Appointment,
  BackupFile,
  Customer,
  Database,
  ID,
  Invoice,
  LabOrder,
  LabOrderStatus,
  Prescription,
  Product,
  Purchase,
  PurchaseStatus,
  ReturnRecord,
  StockMovement,
  Supplier,
  User,
} from '@/types';
import { buildBackup, createEmptyDatabase, loadDatabase, saveDatabase } from './db';
import { createDemoDatabase } from './seed';
import { peekNumber, SYSTEM_ACTOR, type Actor, type CounterKey } from './ops/shared';
import * as catalog from './ops/catalog';
import * as people from './ops/people';
import * as sales from './ops/sales';
import * as workflow from './ops/workflow';
import { hashPassword, randomSalt } from '@/lib/hash';

/* ---------------------------------------------------------------------------
 * Central data provider.
 * Holds the whole database in React state, persists it to localStorage and
 * exposes thin wrappers around the pure operations in `src/store/ops`.
 * ------------------------------------------------------------------------- */

export interface DataContextValue {
  db: Database;
  settings: AppSettings;

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
  users: User[];

  /* lookups */
  customerById: (id?: ID | null) => Customer | undefined;
  productById: (id?: ID | null) => Product | undefined;
  supplierById: (id?: ID | null) => Supplier | undefined;
  prescriptionById: (id?: ID | null) => Prescription | undefined;
  invoiceById: (id?: ID | null) => Invoice | undefined;
  labOrderById: (id?: ID | null) => LabOrder | undefined;
  purchaseById: (id?: ID | null) => Purchase | undefined;
  prescriptionsOf: (customerId?: ID) => Prescription[];
  invoicesOf: (customerId?: ID) => Invoice[];
  labOrdersOf: (customerId?: ID) => LabOrder[];
  appointmentsOf: (customerId?: ID) => Appointment[];
  /** Preview of the next document number without consuming it. */
  previewNumber: (key: CounterKey) => string;

  /* session actor (set by the auth provider) */
  actor: Actor;
  setActor: (actor: Actor) => void;

  /* customers */
  addCustomer: (input: people.CustomerInput) => Customer;
  updateCustomer: (id: ID, patch: Partial<people.CustomerInput>) => void;
  deleteCustomer: (id: ID) => void;

  /* prescriptions */
  addPrescription: (input: people.PrescriptionInput) => Prescription;
  updatePrescription: (id: ID, patch: Partial<people.PrescriptionInput>) => void;
  deletePrescription: (id: ID) => void;

  /* products & stock */
  addProduct: (input: catalog.ProductInput) => Product;
  updateProduct: (id: ID, patch: Partial<catalog.ProductInput>) => void;
  deleteProduct: (id: ID) => void;
  adjustStock: (input: catalog.StockAdjustInput) => void;

  /* suppliers */
  addSupplier: (input: catalog.SupplierInput) => Supplier;
  updateSupplier: (id: ID, patch: Partial<catalog.SupplierInput>) => void;
  deleteSupplier: (id: ID) => void;
  paySupplier: (id: ID, amount: number) => void;

  /* sales */
  createInvoice: (input: sales.CreateInvoiceInput) => Invoice | null;
  addPayment: (invoiceId: ID, input: sales.PaymentInput) => void;
  cancelInvoice: (invoiceId: ID) => void;
  deleteInvoice: (invoiceId: ID) => void;
  createReturn: (input: sales.ReturnInput) => ReturnRecord | null;

  /* lab orders */
  createLabOrder: (input: workflow.LabOrderInput) => LabOrder;
  updateLabOrder: (id: ID, patch: Partial<workflow.LabOrderInput>) => void;
  setLabOrderStatus: (id: ID, status: LabOrderStatus) => void;
  advanceLabOrder: (id: ID) => void;
  deleteLabOrder: (id: ID) => void;

  /* purchases */
  createPurchase: (input: workflow.PurchaseInput) => Purchase;
  updatePurchase: (id: ID, patch: Partial<workflow.PurchaseInput>) => void;
  setPurchaseStatus: (id: ID, status: PurchaseStatus) => void;
  receivePurchase: (id: ID, receipts?: Record<ID, number>) => void;
  payPurchase: (id: ID, amount: number) => void;
  deletePurchase: (id: ID) => void;

  /* appointments */
  addAppointment: (input: people.AppointmentInput) => Appointment;
  updateAppointment: (id: ID, patch: Partial<people.AppointmentInput>) => void;
  deleteAppointment: (id: ID) => void;

  /* users */
  addUser: (input: UserFormInput) => Promise<User | null>;
  updateUser: (id: ID, patch: Partial<Omit<UserFormInput, 'password'>>, password?: string) => Promise<boolean>;
  deleteUser: (id: ID) => void;
  /** Records the last successful login timestamp. */
  markLogin: (id: ID) => void;

  /* settings & data management */
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetToDemo: () => void;
  clearAllData: () => void;
  importDatabase: (database: Database) => void;
  exportBackup: (exportedBy: string) => BackupFile;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Form friendly shape used by the users page (the hash is computed here). */
export interface UserFormInput {
  username: string;
  fullName: string;
  role: User['role'];
  password: string;
  phone?: string;
  email?: string;
  active: boolean;
}

function initialDatabase(): Database {
  return loadDatabase() ?? createDemoDatabase();
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(initialDatabase);
  const [actor, setActorState] = useState<Actor>(SYSTEM_ACTOR);

  // Always read the freshest database inside actions so that several actions
  // triggered in the same tick (e.g. invoice + lab order) do not overwrite
  // each other.
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    saveDatabase(db);
  }, [db]);

  const setActor = useCallback((next: Actor) => setActorState(next), []);

  const value = useMemo<DataContextValue>(() => {
    const commit = (next: Database) => {
      setDb(next);
      dbRef.current = next;
    };

    const findCustomer = (id?: ID | null) => db.customers.find((item) => item.id === id);
    const findProduct = (id?: ID | null) => db.products.find((item) => item.id === id);
    const findSupplier = (id?: ID | null) => db.suppliers.find((item) => item.id === id);
    const findPrescription = (id?: ID | null) => db.prescriptions.find((item) => item.id === id);
    const findInvoice = (id?: ID | null) => db.invoices.find((item) => item.id === id);
    const findLabOrder = (id?: ID | null) => db.labOrders.find((item) => item.id === id);
    const findPurchase = (id?: ID | null) => db.purchases.find((item) => item.id === id);

    return {
      db,
      settings: db.settings,
      customers: db.customers,
      prescriptions: db.prescriptions,
      products: db.products,
      suppliers: db.suppliers,
      invoices: db.invoices,
      returns: db.returns,
      labOrders: db.labOrders,
      purchases: db.purchases,
      appointments: db.appointments,
      stockMovements: db.stockMovements,
      users: db.users,

      customerById: findCustomer,
      productById: findProduct,
      supplierById: findSupplier,
      prescriptionById: findPrescription,
      invoiceById: findInvoice,
      labOrderById: findLabOrder,
      purchaseById: findPurchase,
      prescriptionsOf: (customerId) =>
        customerId ? db.prescriptions.filter((item) => item.customerId === customerId) : [],
      invoicesOf: (customerId) => (customerId ? db.invoices.filter((item) => item.customerId === customerId) : []),
      labOrdersOf: (customerId) => (customerId ? db.labOrders.filter((item) => item.customerId === customerId) : []),
      appointmentsOf: (customerId) =>
        customerId ? db.appointments.filter((item) => item.customerId === customerId) : [],
      previewNumber: (key) => peekNumber(db.settings, key),

      actor,
      setActor,

      /* ------------------------------ customers ------------------------------ */
      addCustomer: (input) => {
        const result = people.addCustomer(dbRef.current, input);
        commit(result.db);
        return result.customer;
      },
      updateCustomer: (id, patch) => commit(people.updateCustomer(dbRef.current, id, patch)),
      deleteCustomer: (id) => commit(people.deleteCustomer(dbRef.current, id)),

      /* ---------------------------- prescriptions ---------------------------- */
      addPrescription: (input) => {
        const result = people.addPrescription(dbRef.current, input);
        commit(result.db);
        return result.prescription;
      },
      updatePrescription: (id, patch) => commit(people.updatePrescription(dbRef.current, id, patch)),
      deletePrescription: (id) => commit(people.deletePrescription(dbRef.current, id)),

      /* ------------------------------ products ------------------------------ */
      addProduct: (input) => {
        const result = catalog.addProduct(dbRef.current, input);
        commit(result.db);
        return result.product;
      },
      updateProduct: (id, patch) => commit(catalog.updateProduct(dbRef.current, id, patch)),
      deleteProduct: (id) => commit(catalog.deleteProduct(dbRef.current, id)),
      adjustStock: (input) => commit(catalog.adjustStock(dbRef.current, input, actor)),

      /* ------------------------------ suppliers ----------------------------- */
      addSupplier: (input) => {
        const result = catalog.addSupplier(dbRef.current, input);
        commit(result.db);
        return result.supplier;
      },
      updateSupplier: (id, patch) => commit(catalog.updateSupplier(dbRef.current, id, patch)),
      deleteSupplier: (id) => commit(catalog.deleteSupplier(dbRef.current, id)),
      paySupplier: (id, amount) => commit(catalog.paySupplier(dbRef.current, id, amount)),

      /* -------------------------------- sales -------------------------------- */
      createInvoice: (input) => {
        const result = sales.createInvoice(dbRef.current, input, actor);
        commit(result.db);
        return result.invoice;
      },
      addPayment: (invoiceId, input) => commit(sales.addPayment(dbRef.current, invoiceId, input, actor)),
      cancelInvoice: (invoiceId) => commit(sales.cancelInvoice(dbRef.current, invoiceId, actor)),
      deleteInvoice: (invoiceId) => commit(sales.deleteInvoice(dbRef.current, invoiceId, actor)),
      createReturn: (input) => {
        const result = sales.createReturn(dbRef.current, input, actor);
        commit(result.db);
        return result.record;
      },

      /* ------------------------------ lab orders ----------------------------- */
      createLabOrder: (input) => {
        const result = workflow.createLabOrder(dbRef.current, input, actor);
        commit(result.db);
        return result.order;
      },
      updateLabOrder: (id, patch) => commit(workflow.updateLabOrder(dbRef.current, id, patch)),
      setLabOrderStatus: (id, status) => commit(workflow.setLabOrderStatus(dbRef.current, id, status)),
      advanceLabOrder: (id) => commit(workflow.advanceLabOrder(dbRef.current, id)),
      deleteLabOrder: (id) => commit(workflow.deleteLabOrder(dbRef.current, id)),

      /* ------------------------------ purchases ------------------------------ */
      createPurchase: (input) => {
        const result = workflow.createPurchase(dbRef.current, input, actor);
        commit(result.db);
        return result.purchase;
      },
      updatePurchase: (id, patch) => commit(workflow.updatePurchase(dbRef.current, id, patch)),
      setPurchaseStatus: (id, status) => commit(workflow.setPurchaseStatus(dbRef.current, id, status)),
      receivePurchase: (id, receipts) => commit(workflow.receivePurchase(dbRef.current, id, receipts, actor)),
      payPurchase: (id, amount) => commit(workflow.payPurchase(dbRef.current, id, amount)),
      deletePurchase: (id) => commit(workflow.deletePurchase(dbRef.current, id)),

      /* ----------------------------- appointments ---------------------------- */
      addAppointment: (input) => {
        const result = people.addAppointment(dbRef.current, input);
        commit(result.db);
        return result.appointment;
      },
      updateAppointment: (id, patch) => commit(people.updateAppointment(dbRef.current, id, patch)),
      deleteAppointment: (id) => commit(people.deleteAppointment(dbRef.current, id)),

      /* --------------------------------- users ------------------------------- */
      addUser: async (input) => {
        const salt = randomSalt();
        const passwordHash = await hashPassword(input.password, salt);
        const result = people.addUser(dbRef.current, {
          username: input.username.trim().toLowerCase(),
          fullName: input.fullName.trim(),
          role: input.role,
          phone: input.phone,
          email: input.email,
          active: input.active,
          passwordHash,
          salt,
        });
        commit(result.db);
        return result.user;
      },
      updateUser: async (id, patch, password) => {
        const next: Partial<people.UserInput> = { ...patch };
        if (patch.username) next.username = patch.username.trim().toLowerCase();
        if (password) {
          const salt = randomSalt();
          next.salt = salt;
          next.passwordHash = await hashPassword(password, salt);
        }
        commit(people.updateUser(dbRef.current, id, next));
        return true;
      },
      deleteUser: (id) => commit(people.deleteUser(dbRef.current, id)),
      markLogin: (id) => commit(people.markLogin(dbRef.current, id)),

      /* -------------------------- settings & data ---------------------------- */
      updateSettings: (patch) =>
        commit({ ...dbRef.current, settings: { ...dbRef.current.settings, ...patch } }),
      resetToDemo: () => commit(createDemoDatabase()),
      clearAllData: () => {
        const current = dbRef.current;
        commit(createEmptyDatabase(current.settings, current.users));
      },
      importDatabase: (database) => commit(database),
      exportBackup: (exportedBy) => buildBackup(dbRef.current, exportedBy),
    };
  }, [db, actor, setActor]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

