import {
  customers as placeholderCustomers,
  invoices as placeholderInvoices,
} from './placeholder-data';

type LocalInvoice = {
  id: string;
  customer_id: string;
  amount: number;
  status: 'pending' | 'paid';
  date: string;
};

type LocalCustomer = {
  id: string;
  name: string;
  email: string;
  image_url: string;
};

declare global {
  var __localInvoices: LocalInvoice[] | undefined;
}

function seedInvoices(): LocalInvoice[] {
  return placeholderInvoices.map((invoice, index) => ({
    id: `${invoice.customer_id}-${invoice.date}-${index}`,
    customer_id: invoice.customer_id,
    amount: invoice.amount,
    status: invoice.status as 'pending' | 'paid',
    date: invoice.date,
  }));
}

export function getLocalInvoices(): LocalInvoice[] {
  if (!globalThis.__localInvoices) {
    globalThis.__localInvoices = seedInvoices();
  }

  return globalThis.__localInvoices;
}

export function getLocalCustomers(): LocalCustomer[] {
  return placeholderCustomers;
}

export function createLocalInvoice({
  customerId,
  amount,
  status,
  date,
}: {
  customerId: string;
  amount: number;
  status: 'pending' | 'paid';
  date: string;
}) {
  getLocalInvoices().unshift({
    id: `${customerId}-${date}-${Date.now()}`,
    customer_id: customerId,
    amount,
    status,
    date,
  });
}

export function updateLocalInvoice({
  id,
  customerId,
  amount,
  status,
}: {
  id: string;
  customerId: string;
  amount: number;
  status: 'pending' | 'paid';
}) {
  const invoice = getLocalInvoices().find((invoice) => invoice.id === id);

  if (!invoice) {
    return;
  }

  invoice.customer_id = customerId;
  invoice.amount = amount;
  invoice.status = status;
}

export function deleteLocalInvoice(id: string) {
  const invoices = getLocalInvoices();
  const index = invoices.findIndex((invoice) => invoice.id === id);

  if (index >= 0) {
    invoices.splice(index, 1);
  }
}
