import type { Appointment, Customer, Database, ID, Prescription, User } from '@/types';
import { nowISO } from '@/lib/date';
import { uid } from '@/lib/id';
import { allocateNumber, findById, removeById, upsert } from './shared';

/* ---------------------------------------------------------------------------
 * People operations: customers, prescriptions, appointments and staff users.
 * ------------------------------------------------------------------------- */

export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'code'> & { code?: string };
export type PrescriptionInput = Omit<Prescription, 'id' | 'number' | 'createdAt'> & { number?: string };
export type AppointmentInput = Omit<Appointment, 'id' | 'createdAt'>;

export function addCustomer(db: Database, input: CustomerInput): { db: Database; customer: Customer } {
  const allocation = allocateNumber(db, 'customers');
  const timestamp = nowISO();
  const customer: Customer = {
    ...input,
    code: input.code || allocation.number,
    id: uid('cus'),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { db: { ...allocation.db, customers: [customer, ...allocation.db.customers] }, customer };
}

export function updateCustomer(db: Database, id: ID, patch: Partial<CustomerInput>): Database {
  const existing = findById(db.customers, id);
  if (!existing) return db;
  return { ...db, customers: upsert(db.customers, { ...existing, ...patch, id, updatedAt: nowISO() }) };
}

/** Removes a customer together with their medical records and appointments. */
export function deleteCustomer(db: Database, id: ID): Database {
  return {
    ...db,
    customers: removeById(db.customers, id),
    prescriptions: db.prescriptions.filter((item) => item.customerId !== id),
    appointments: db.appointments.filter((item) => item.customerId !== id),
  };
}

/** Awards loyalty points after a purchase. */
export function awardLoyaltyPoints(db: Database, customerId: ID | undefined, amount: number): Database {
  if (!customerId) return db;
  const customer = findById(db.customers, customerId);
  if (!customer) return db;
  const earned = Math.floor(amount * (db.settings.loyaltyPointsPerCurrency || 0));
  if (earned <= 0) return db;
  return { ...db, customers: upsert(db.customers, { ...customer, loyaltyPoints: customer.loyaltyPoints + earned }) };
}

export function addPrescription(
  db: Database,
  input: PrescriptionInput,
): { db: Database; prescription: Prescription } {
  const allocation = allocateNumber(db, 'prescriptions');
  const prescription: Prescription = {
    ...input,
    number: input.number || allocation.number,
    id: uid('rx'),
    createdAt: nowISO(),
  };
  return {
    db: { ...allocation.db, prescriptions: [prescription, ...allocation.db.prescriptions] },
    prescription,
  };
}

export function updatePrescription(db: Database, id: ID, patch: Partial<PrescriptionInput>): Database {
  const existing = findById(db.prescriptions, id);
  if (!existing) return db;
  return { ...db, prescriptions: upsert(db.prescriptions, { ...existing, ...patch, id }) };
}

export function deletePrescription(db: Database, id: ID): Database {
  return { ...db, prescriptions: removeById(db.prescriptions, id) };
}

export function addAppointment(db: Database, input: AppointmentInput): { db: Database; appointment: Appointment } {
  const appointment: Appointment = { ...input, id: uid('apt'), createdAt: nowISO() };
  return { db: { ...db, appointments: [appointment, ...db.appointments] }, appointment };
}

export function updateAppointment(db: Database, id: ID, patch: Partial<AppointmentInput>): Database {
  const existing = findById(db.appointments, id);
  if (!existing) return db;
  return { ...db, appointments: upsert(db.appointments, { ...existing, ...patch, id }) };
}

export function deleteAppointment(db: Database, id: ID): Database {
  return { ...db, appointments: removeById(db.appointments, id) };
}

export type UserInput = Omit<User, 'id' | 'createdAt' | 'lastLoginAt'>;

export function addUser(db: Database, input: UserInput): { db: Database; user: User } {
  const user: User = { ...input, id: uid('usr'), createdAt: nowISO() };
  return { db: { ...db, users: [user, ...db.users] }, user };
}

export function updateUser(db: Database, id: ID, patch: Partial<UserInput>): Database {
  const existing = findById(db.users, id);
  if (!existing) return db;
  return { ...db, users: upsert(db.users, { ...existing, ...patch, id }) };
}

export function deleteUser(db: Database, id: ID): Database {
  return { ...db, users: removeById(db.users, id) };
}

export function markLogin(db: Database, id: ID): Database {
  const existing = findById(db.users, id);
  if (!existing) return db;
  return { ...db, users: upsert(db.users, { ...existing, lastLoginAt: nowISO() }) };
}
