/** A modal opened under one authority never becomes the form for another. */
export const processCreationModalVisible = (isOpen: boolean, openedKey: string | null, currentKey: string | null) =>
    Boolean(isOpen && openedKey && currentKey && openedKey === currentKey);

/** The old async handler may settle after a context change or unmount. */
export const processCreationModalCompletionCurrent = (startedKey: string, currentKey: string | null, mounted: boolean) =>
    Boolean(mounted && currentKey && startedKey === currentKey);
