import { useBlocker } from "@tanstack/react-router";

/**
 * Block both in-app navigation (router) and tab close / reload (beforeunload) while
 * there are unsaved changes. In-app navigation shows a confirm; the browser shows its
 * native leave prompt. Used by the entry editor and field sheet.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean): void {
  useBlocker({
    disabled: !hasUnsavedChanges,
    enableBeforeUnload: hasUnsavedChanges,
    shouldBlockFn: () => {
      if (!hasUnsavedChanges) return false;
      return !window.confirm("You have unsaved changes. Leave without saving?");
    },
  });
}
