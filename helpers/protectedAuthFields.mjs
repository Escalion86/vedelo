// Generic user CRUD must never assign OAuth identities, including dotted updates.
const isAuthField = (path) => String(path).split('.').some(key => key === 'yandexId' || key === 'yandexUnlinkedAt')
export const hasProtectedAuthFields = (value) =>
  Boolean(value && typeof value === 'object' && Object.entries(value).some(
    ([key, item]) => isAuthField(key) ||
      (key === '$rename' && Object.values(item || {}).some(isAuthField)) ||
      hasProtectedAuthFields(item)
  ))
