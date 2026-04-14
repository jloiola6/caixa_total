export const MOBILE_MENU_SHORTCUT_LIMIT = 4;

const STORE_USER_MENU_ITEMS = [
  "/caixa",
  "/produtos",
  "/financeiro",
  "/relatorios",
  "/notificacoes",
  "/configuracoes",
] as const;

export function getAllowedStoreMobileMenuShortcuts(
  financeModuleEnabled: boolean
): string[] {
  if (financeModuleEnabled) return [...STORE_USER_MENU_ITEMS];
  return STORE_USER_MENU_ITEMS.filter((href) => href !== "/financeiro");
}

export function sanitizeStoreMobileMenuShortcuts(
  shortcuts: string[] | null | undefined,
  financeModuleEnabled: boolean
): string[] {
  if (!Array.isArray(shortcuts) || shortcuts.length === 0) return [];

  const requested = new Set(
    shortcuts.filter((value): value is string => typeof value === "string")
  );

  return getAllowedStoreMobileMenuShortcuts(financeModuleEnabled)
    .filter((href) => requested.has(href))
    .slice(0, MOBILE_MENU_SHORTCUT_LIMIT);
}
