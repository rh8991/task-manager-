import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type WhereFilterOp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { DEFAULT_SETTINGS, type Settings, type WithId } from "./types";

/**
 * Live data hooks. Collections are small (about 30 workers), so pages subscribe to whole
 * collections and filter, group and count in the browser. onSnapshot keeps every screen
 * up to date without reloading.
 */
export type Live<T> = { data: T; loading: boolean; error: string | null };

export type Clause = [field: string, op: WhereFilterOp, value: unknown];
export type QueryOpts = {
  where?: Clause | Clause[];
  orderBy?: [field: string, dir: "asc" | "desc"];
  limit?: number;
};

export function useCollection<T = DocumentData>(path: string | null, opts: QueryOpts = {}): Live<WithId<T>[]> {
  const [state, setState] = useState<Live<WithId<T>[]>>({ data: [], loading: !!path, error: null });
  const key = `${path}|${JSON.stringify(opts)}`;
  useEffect(() => {
    if (!path) return setState({ data: [], loading: false, error: null });
    const c: QueryConstraint[] = [];
    const clauses = !opts.where ? [] : Array.isArray(opts.where[0]) ? (opts.where as Clause[]) : [opts.where as Clause];
    for (const w of clauses) c.push(where(...w));
    if (opts.orderBy) c.push(orderBy(...opts.orderBy));
    if (opts.limit) c.push(limit(opts.limit));
    return onSnapshot(
      query(collection(db, path), ...c),
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), loading: false, error: null }),
      (err) => setState({ data: [], loading: false, error: err.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useDocument<T = DocumentData>(path: string | null): Live<WithId<T> | null> {
  const [state, setState] = useState<Live<WithId<T> | null>>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) return setState({ data: null, loading: false, error: null });
    return onSnapshot(
      doc(db, path),
      (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: err.message }),
    );
  }, [path]);
  return state;
}

/** Settings, with defaults for fields that were never saved. */
export function useSettings(): Live<Settings> {
  const s = useDocument<Partial<Settings>>("settings/main");
  return { ...s, data: { ...DEFAULT_SETTINGS, ...(s.data ?? {}) } };
}

export type AdminState = { user: User | null; isAdmin: boolean; loading: boolean };

/** The signed-in Firebase user and whether they are a manager (admins/{uid} exists). */
export function useAdmin(): AdminState {
  const [state, setState] = useState<AdminState>({ user: auth.currentUser, isAdmin: false, loading: true });
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) return setState({ user: null, isAdmin: false, loading: false });
        try {
          const snap = await getDoc(doc(db, "admins", user.uid));
          setState({ user, isAdmin: snap.exists(), loading: false });
        } catch {
          setState({ user, isAdmin: false, loading: false });
        }
      }),
    [],
  );
  return state;
}

/** Map of id → document, for looking up names. */
export function byId<T>(list: WithId<T>[]): Map<string, WithId<T>> {
  return new Map(list.map((x) => [x.id, x]));
}
