import { API, apiJson } from './api';

export type Purchase = { product: string; purchased_at: string };
export type LinkStatus = 'pending' | 'denied' | 'aucune';

export const getPurchases = () => apiJson<Purchase[]>(`${API}/purchases`);
export const getLinkStatus = () => apiJson<{ status: LinkStatus }>(`${API}/link-requests`).then((r) => r.status);
export const submitLinkRequest = (email: string) => apiJson<{ ok: true }>(`${API}/link-requests`, { method: 'POST', body: JSON.stringify({ email }) });
