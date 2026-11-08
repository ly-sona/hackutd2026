export function safeReturnPath(value: unknown) {
  return typeof value === 'string' && /^\/(org\/|invite\/|organizations(?:$|\?))/.test(value) && !value.includes('\\') && !/[\r\n]/.test(value)
    ? value : '/organizations';
}
