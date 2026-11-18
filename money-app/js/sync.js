// Accounts + cloud sync against Supabase, using plain fetch (no extra libraries).
//
//  - Auth: Supabase Auth (GoTrue) endpoints  /auth/v1/*
//  - Data: Supabase PostgREST endpoints       /rest/v1/*   (protected by row-level security)
//
// The app stays offline-first: it always works from local data and syncs in the background.
import { mergeState } from './store.js';
import * as config from './config.js'; // namespace import: an older config.js without newer settings still loads

const { SUPABASE_URL, SUPABASE_ANON_KEY, USERNAME_EMAIL_DOMAIN } = config;

const BASE = String(SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = String(SUPABASE_ANON_KEY || '');
export const cloudEnabled = Boolean(BASE && ANON);

const SESSION_KEY = 'pocketledger.session';
const OWNER_KEY = 'pocketledger.owner';

export const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;
export const normalizeUsername = (u) => String(u || '').trim().toLowerCase();
export const usernameToEmail = (u) => `${normalizeUsername(u)}@${USERNAME_EMAIL_DOMAIN || 'pocketledger.app'}`;
export const displayName = (email) => String(email || '').split('@')[0];

// Turn Supabase's technical auth errors into messages a person can act on.
function friendly(e) {
  const m = String(e.message || '');
  if (/invalid login credentials/i.test(m)) return 'Wrong username or password.';
  if (/already registered|already exists/i.test(m)) return 'That username is already taken. Try another one.';
  if (/not confirmed/i.test(m)) return 'This project still requires email confirmation. In Supabase, turn off Authentication > Providers > Email > Confirm email.';
  if (/(email|address).*invalid|invalid.*(email|address)/i.test(m)) return 'Supabase rejected the internal address. Change USERNAME_EMAIL_DOMAIN in js/config.js to a real-looking domain.';
  if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/password/i.test(m) && /(weak|short|least|characters)/i.test(m)) return 'That password is too weak. Use at least 8 characters.';
  return m;
}

export class AuthError extends Error {}
export class NetworkError extends Error {}

// ---------- low-level http ----------

async function http(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token || ANON}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError('You appear to be offline.');
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    let msg = data?.msg || data?.error_description || data?.message || data?.error || `Request failed (${res.status})`;
    if (['PGRST205', '42P01', 'PGRST204', '42703'].includes(data?.code)) {
      msg += ' (Run the latest supabase/schema.sql in your Supabase SQL Editor. It is safe to run again on an existing project.)';
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- session storage ----------

function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    return s && s.access_token && s.refresh_token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

function writeSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked */
  }
}

function toSession(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at ? d.expires_at * 1000 : Date.now() + (d.expires_in || 3600) * 1000,
    user: { id: d.user.id, email: d.user.email },
  };
}

export const getSession = () => readSession();
export const getOwner = () => {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
};
export const setOwner = (id) => {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* ignore */
  }
};

let refreshing = null;
async function freshSession() {
  const s = readSession();
  if (!s) throw new AuthError('Please sign in.');
  if (s.expires_at - 60_000 > Date.now()) return s;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const d = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
        const next = toSession(d);
        writeSession(next);
        return next;
      } catch (e) {
        if (e instanceof NetworkError) throw e;
        writeSession(null);
        throw new AuthError('Your session expired. Please sign in again.');
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

// ---------- account actions ----------

export async function signUp(username, password) {
  let d;
  try {
    d = await http('/auth/v1/signup', { method: 'POST', body: { email: usernameToEmail(username), password } });
  } catch (e) {
    if (e instanceof NetworkError) throw e;
    throw new Error(friendly(e));
  }
  if (d?.access_token) {
    const session = toSession(d);
    writeSession(session);
    return session;
  }
  // No session came back: the project still requires email confirmation (or the name is taken).
  throw new Error(friendly({ message: 'not confirmed' }));
}

export async function signIn(username, password) {
  let d;
  try {
    d = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: usernameToEmail(username), password } });
  } catch (e) {
    if (e instanceof NetworkError) throw e;
    throw new Error(friendly(e));
  }
  const session = toSession(d);
  writeSession(session);
  return session;
}

export async function signOut() {
  const s = readSession();
  writeSession(null);
  if (s) {
    try {
      await http('/auth/v1/logout', { method: 'POST', token: s.access_token });
    } catch {
      /* already signed out locally */
    }
  }
}

export async function setPassword(password) {
  const s = await freshSession();
  try {
    await http('/auth/v1/user', { method: 'PUT', token: s.access_token, body: { password } });
  } catch (e) {
    if (e instanceof NetworkError) throw e;
    throw new Error(friendly(e));
  }
}

// ---------- data sync ----------

async function rest(path, opts = {}) {
  const s = await freshSession();
  return http('/rest/v1/' + path, { ...opts, token: s.access_token });
}

async function fetchAll(table) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await rest(`${table}?select=*&order=id.asc&limit=1000&offset=${offset}`);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const fromCat = (r) => ({
  id: r.id, name: r.name, type: r.type, budget: Number(r.budget) || 0, updatedAt: Number(r.updated_at) || 0,
  ...(r.deleted ? { deleted: true } : {}),
});
const toCat = (c) => ({
  id: c.id, name: c.name, type: c.type, budget: c.budget || 0, updated_at: c.updatedAt || 0, deleted: !!c.deleted,
});
const fromAcc = (r) => ({
  id: r.id, name: r.name, opening: Number(r.opening) || 0, institution: r.institution || '', updatedAt: Number(r.updated_at) || 0, ...(r.deleted ? { deleted: true } : {}),
});
const toAcc = (a) => ({ id: a.id, name: a.name, opening: a.opening || 0, institution: a.institution || '', updated_at: a.updatedAt || 0, deleted: !!a.deleted });
const fromTx = (r) => ({
  id: r.id, type: r.type, amount: Number(r.amount), categoryId: r.category_id || '', accountId: r.account_id || '', date: r.date, note: r.note || '',
  updatedAt: Number(r.updated_at) || 0, ...(r.deleted ? { deleted: true } : {}),
});
const toTx = (t) => ({
  id: t.id, type: t.type, amount: t.amount, category_id: t.categoryId || '', account_id: t.accountId || '', date: t.date, note: t.note || '',
  updated_at: t.updatedAt || 0, deleted: !!t.deleted,
});

async function push(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    await rest(table, {
      method: 'POST',
      body: rows.slice(i, i + 500),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }
}

// Pull the account's data, merge it with local data (newest edit per record wins), push back
// whatever is newer locally, and return the merged state.
export async function syncNow(state) {
  const [rc, ra, rt, rs] = await Promise.all([fetchAll('categories'), fetchAll('accounts'), fetchAll('transactions'), rest('settings?select=*')]);
  const remote = {
    categories: rc.map(fromCat),
    accounts: ra.map(fromAcc),
    transactions: rt.map(fromTx),
    settings: rs[0] ? { currency: rs[0].currency, updatedAt: Number(rs[0].updated_at) || 0 } : undefined,
  };
  const merged = mergeState(state, remote);

  const newer = (list, remoteList) => {
    const seen = new Map(remoteList.map((r) => [r.id, r.updatedAt]));
    return list.filter((x) => !seen.has(x.id) || x.updatedAt > seen.get(x.id));
  };
  await push('categories', newer(merged.categories, remote.categories).map(toCat));
  await push('accounts', newer(merged.accounts, remote.accounts).map(toAcc));
  await push('transactions', newer(merged.transactions, remote.transactions).map(toTx));
  if (merged.settings.updatedAt > (remote.settings?.updatedAt ?? 0)) {
    await push('settings', [{ currency: merged.settings.currency, updated_at: merged.settings.updatedAt }]);
  }
  return merged;
}
