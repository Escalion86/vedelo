const toPlainCustom = (custom) => {
  if (!custom || typeof custom !== 'object') return {}
  if (typeof custom.get === 'function') return Object.fromEntries(custom)
  return custom
}

export const mergeSiteSettingsCustom = (existing, patch) => ({
  ...toPlainCustom(existing),
  ...toPlainCustom(patch),
})
