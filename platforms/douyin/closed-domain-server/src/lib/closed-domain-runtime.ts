export function isBPreviewRuntime(): boolean {
  return (process.env.APP_ENV ?? 'DEV').trim().toUpperCase() === 'DEV';
}
