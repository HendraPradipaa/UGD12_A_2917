import postgres from 'postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import {
  revenue as placeholderRevenue,
} from './placeholder-data';
import { formatCurrency } from './utils';
import { getLocalCustomers, getLocalInvoices } from './local-data';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const ITEMS_PER_PAGE = 6;

function filterPlaceholderInvoices(query: string): InvoicesTable[] {
  const normalizedQuery = query.toLowerCase();

  return getLocalInvoices()
    .map((invoice) => {
      const customer = getLocalCustomers().find(
        (customer) => customer.id === invoice.customer_id,
      );

      if (!customer) {
        return null;
      }

      return {
        id: invoice.id,
        customer_id: invoice.customer_id,
        name: customer.name,
        email: customer.email,
        image_url: customer.image_url,
        date: invoice.date,
        amount: invoice.amount,
        status: invoice.status,
      };
    })
    .filter((invoice): invoice is InvoicesTable => invoice !== null)
    .filter((invoice) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        invoice.name.toLowerCase().includes(normalizedQuery) ||
        invoice.email.toLowerCase().includes(normalizedQuery) ||
        invoice.amount.toString().includes(normalizedQuery) ||
        invoice.date.toLowerCase().includes(normalizedQuery) ||
        invoice.status.toLowerCase().includes(normalizedQuery)
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function getPlaceholderLatestInvoices(): LatestInvoiceRaw[] {
  return filterPlaceholderInvoices('')
    .slice(0, 5)
    .map((invoice) => ({
      id: invoice.id,
      name: invoice.name,
      image_url: invoice.image_url,
      email: invoice.email,
      amount: invoice.amount,
    }));
}

function getPlaceholderCardData() {
  const totalPaid = getLocalInvoices()
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalPending = getLocalInvoices()
    .filter((invoice) => invoice.status === 'pending')
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  return {
    numberOfCustomers: getLocalCustomers().length,
    numberOfInvoices: getLocalInvoices().length,
    totalPaidInvoices: formatCurrency(totalPaid),
    totalPendingInvoices: formatCurrency(totalPending),
  };
}

export async function fetchRevenue() {
  try {
    // Artificially delay a response for demo purposes.
    // Don't do this in production :)

    console.log('Fetching revenue data...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (!process.env.POSTGRES_URL) {
      console.log('Data fetch completed after 3 seconds.');
      return placeholderRevenue;
    }

    const data = await sql<Revenue[]>`SELECT * FROM revenue`;

    console.log('Data fetch completed after 3 seconds.');

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    return placeholderRevenue;
  }
}

export async function fetchLatestInvoices() {
  try {
    if (!process.env.POSTGRES_URL) {
      return getPlaceholderLatestInvoices().map((invoice) => ({
        ...invoice,
        amount: formatCurrency(invoice.amount),
      }));
    }

    const data = await sql<LatestInvoiceRaw[]>`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5`;

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    return getPlaceholderLatestInvoices().map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
  }
}

export async function fetchCardData() {
  try {
    if (!process.env.POSTGRES_URL) {
      return getPlaceholderCardData();
    }

    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices`;
    const customerCountPromise = sql`SELECT COUNT(*) FROM customers`;
    const invoiceStatusPromise = sql`SELECT
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
         SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
         FROM invoices`;

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0][0].count ?? '0');
    const numberOfCustomers = Number(data[1][0].count ?? '0');
    const totalPaidInvoices = formatCurrency(data[2][0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(data[2][0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    return getPlaceholderCardData();
  }
}

export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  if (!process.env.POSTGRES_URL) {
    return filterPlaceholderInvoices(query).slice(
      offset,
      offset + ITEMS_PER_PAGE,
    );
  }

  try {
    const invoices = await sql<InvoicesTable[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    return filterPlaceholderInvoices(query).slice(
      offset,
      offset + ITEMS_PER_PAGE,
    );
  }
}

export async function fetchInvoicesPages(query: string) {
  if (!process.env.POSTGRES_URL) {
    return Math.ceil(filterPlaceholderInvoices(query).length / ITEMS_PER_PAGE);
  }

  try {
    const data = await sql`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    return Math.ceil(filterPlaceholderInvoices(query).length / ITEMS_PER_PAGE);
  }
}

export async function fetchInvoiceById(id: string) {
  if (!process.env.POSTGRES_URL) {
    const invoice = filterPlaceholderInvoices('').find(
      (invoice) => invoice.id === id,
    );

    if (!invoice) {
      return undefined;
    }

    return {
      id: invoice.id,
      customer_id: invoice.customer_id,
      amount: invoice.amount / 100,
      status: invoice.status,
    };
  }

  try {
    const data = await sql<InvoiceForm[]>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `;

    const invoice = data.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    return undefined;
  }
}

export async function fetchCustomers() {
  if (!process.env.POSTGRES_URL) {
    return getLocalCustomers()
      .map((customer) => ({
        id: customer.id,
        name: customer.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  try {
    const customers = await sql<CustomerField[]>`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `;

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    return getLocalCustomers()
      .map((customer) => ({
        id: customer.id,
        name: customer.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType[]>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}
