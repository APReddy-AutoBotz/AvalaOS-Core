import { StorageKeys } from './storage';

export const AuthorityLocalStorageKeys = [
  StorageKeys.CURRENT_USER,
  StorageKeys.ORGANIZATION,
  StorageKeys.SCOPE,
  StorageKeys.VIEW,
] as const;

export const AuthoritySessionStorageKeys = [
  'avala.enterprise.session.selection',
] as const;

export interface RemovableStorage {
  removeItem(key: string): void;
}

export interface AuthorityStorageClearResult {
  attempted: number;
  failed: string[];
}

const removeEach = (
  storage: RemovableStorage | undefined,
  keys: readonly string[],
  failed: string[],
) => {
  for (const key of keys) {
    try {
      storage?.removeItem(key);
    } catch {
      failed.push(key);
    }
  }
};

/**
 * Clears only persisted authentication and navigation authority. Product data,
 * user preferences, and synthetic fixtures are deliberately preserved.
 * Every key is attempted independently so one unavailable storage entry cannot
 * leave the remaining identity or tenant-selection keys untouched.
 */
export const clearPersistedAuthorityState = ({
  local = typeof localStorage === 'undefined' ? undefined : localStorage,
  session = typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
}: {
  local?: RemovableStorage;
  session?: RemovableStorage;
} = {}): AuthorityStorageClearResult => {
  const failed: string[] = [];
  removeEach(local, AuthorityLocalStorageKeys, failed);
  removeEach(session, AuthoritySessionStorageKeys, failed);
  return {
    attempted: AuthorityLocalStorageKeys.length + AuthoritySessionStorageKeys.length,
    failed,
  };
};
