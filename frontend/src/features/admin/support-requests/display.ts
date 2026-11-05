import { readableIdentityName, shortIdentity, siteIdentity } from '@/lib/identity-display';

type Ticket = { account_id: string; account_name?: string; email: string; site_id?: string; site_name?: string; site_url?: string };
export const supportCustomerLabel = (ticket: Ticket, unnamed: string) =>
  readableIdentityName(ticket.account_name, ticket.account_id) || ticket.email || `${unnamed} · ${shortIdentity(ticket.account_id)}`;
export const supportSiteLabel = (ticket: Ticket, unnamed: string) =>
  siteIdentity(ticket.site_name, ticket.site_url, ticket.site_id || '', unnamed);
