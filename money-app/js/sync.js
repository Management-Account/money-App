// Cloud sync placeholder.
//
// The app works fully offline today (data lives in this device's browser storage).
// To sync PC + Android, implement syncNow() against a backend such as Supabase:
//
//   1. Create tables `categories` and `transactions` with the same fields as the local
//      records (id uuid primary key, updatedAt bigint, deleted boolean, user_id uuid).
//   2. Turn on row-level security so each user can only read/write their own rows.
//   3. In syncNow(): fetch remote rows, call mergeState(localState, remoteState) from
//      store.js, push rows that are newer locally, and return the merged state.
//
// mergeState() is already written and tested (last write wins per record).

export const syncEnabled = false;

export async function syncNow(state) {
  return state;
}
