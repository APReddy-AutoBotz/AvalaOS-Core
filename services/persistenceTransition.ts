export const persistBeforeCommit = async <T>(
  persist: () => Promise<T>,
  commitSuccess: (saved: T) => void,
) => {
  const saved = await persist();
  commitSuccess(saved);
  return saved;
};
