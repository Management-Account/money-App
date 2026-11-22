// Family profiles: one login, several profiles. Each profile has its own data (accounts, transactions, categories,
// debts, settings). This module keeps the list of profiles, which one is open, and the optional PIN.
// The PIN only stops casual snooping on a shared phone: it is a short number, so it is not strong protection.

import { uid, mergeCollections } from './store.js';

export const MAIN = 'main'; // the first profile: it keeps the data that existed before profiles were added
const FAMILY_KEY = 'pocketledger.family';

// Where one profile's data lives on this device. The first profile keeps the original key.
export const profileKey = (id) => (id === MAIN ? 'pocketledger.v1' : `pocketledger.v1.p.${id}`);

export const PROFILE_COLORS = ['#6d5efc', '#22c1c3', '#f59e0b', '#ef6a6a', '#34d399', '#e879f9', '#60a5fa', '#f97316'];

const cleanProfile = (p) => {
  if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 60) return null;
  const name = typeof p.name === 'string' ? p.name.trim().slice(0, 40) : '';
  if (!name) return null;
  return {
    id: p.id,
    name,
    color: typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PROFILE_COLORS[0],
    pin: typeof p.pin === 'string' && /^[0-9a-f:]{0,200}$/.test(p.pin) ? p.pin : '',
    updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
    ...(p.deleted ? { deleted: true } : {}),
  };
};

export const liveProfiles = (f) => f.profiles.filter((p) => !p.deleted);
export const profileById = (f, id) => f.profiles.find((p) => p.id === id && !p.deleted);

// Make sure the list is usable: a first profile exists and the open profile is one that exists.
export function normalizeFamily(f) {
  let profiles = (Array.isArray(f?.profiles) ? f.profiles : []).map(cleanProfile).filter(Boolean);
  if (!profiles.some((p) => p.id === MAIN && !p.deleted) && !profiles.some((p) => !p.deleted)) {
    profiles = [...profiles.filter((p) => p.id !== MAIN), { id: MAIN, name: 'Me', color: PROFILE_COLORS[0], pin: '', updatedAt: 0 }];
  }
  const out = { profiles, active: f?.active };
  if (!profileById(out, out.active)) out.active = (profileById(out, MAIN) || liveProfiles(out)[0]).id;
  return out;
}

export function loadFamily() {
  try {
    return normalizeFamily(JSON.parse(localStorage.getItem(FAMILY_KEY)));
  } catch {
    return normalizeFamily(null);
  }
}
export function saveFamily(f) {
  try {
    localStorage.setItem(FAMILY_KEY, JSON.stringify({ profiles: f.profiles, active: f.active }));
  } catch {
    /* storage full or blocked: the open profile simply resets to the first one next time */
  }
}

// Forget every profile on this device (sign out, or a different person signing in).
export function wipeFamilyLocal(f) {
  try {
    for (const p of f.profiles) localStorage.removeItem(profileKey(p.id));
    localStorage.removeItem(profileKey(MAIN));
    localStorage.removeItem(FAMILY_KEY);
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

export const newProfile = (name, color) => ({ id: uid(), name: name.trim().slice(0, 40), color, pin: '', updatedAt: Date.now() });

export function mergeProfiles(local, remote) {
  return mergeCollections(local, remote.map(cleanProfile).filter(Boolean));
}

// ---- PIN (optional, per profile) ----
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function digest(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  if (globalThis.crypto?.subtle) {
    const key = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 20000 }, key, 256));
  }
  let h = 5381; // very old browsers without Web Crypto: a plain hash is still better than storing the PIN
  for (const b of data) h = ((h * 33) ^ b) >>> 0;
  return h.toString(16);
}
export const validPin = (pin) => /^[0-9]{4,6}$/.test(pin);
export async function makePin(pin) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(8)));
  return `${salt}:${await digest(pin, salt)}`;
}
export async function checkPin(pin, stored) {
  const [salt, hash] = String(stored).split(':');
  return !!salt && !!hash && (await digest(pin, salt)) === hash;
}
