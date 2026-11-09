/** English client only (PLAN §1.1). Uncut gems start with "Rarity:" instead of "Item Class:". */
export function isPoeItemText(text: string): boolean {
  return text.startsWith('Item Class: ') || text.startsWith('Rarity: ')
}

/** Advanced descriptions (Ctrl+Alt+C) carry `{ ... Modifier ... }` header lines. */
export function isAdvancedItemText(text: string): boolean {
  return /^\{ .*(Modifier|Enhancement).* \}$/m.test(text)
}
