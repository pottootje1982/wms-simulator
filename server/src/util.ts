let counter = 0;
export function nanoid(): string {
  return `${Date.now().toString(36)}-${(++counter).toString(36)}`;
}
