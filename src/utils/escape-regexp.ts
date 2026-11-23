/**
 * Escape RegExp special characters to treat user input as literal text
 * Prevents ReDoS and regex injection — search input should be literal, not executable regex
 * Escapes: . * + ? ^ $ { } ( ) | [ ] \ 
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
