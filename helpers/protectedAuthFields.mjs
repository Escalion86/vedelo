// Generic user CRUD must never assign OAuth identities, including dotted updates.
export const hasProtectedAuthFields = (value) =>
  Boolean(value && typeof value === 'object' && Object.entries(value).some(
    ([key, item]) => key.split('.').includes('yandexId') ||
      (key === '$rename' && Object.values(item || {}).some((target) => String(target).split('.').includes('yandexId'))) ||
      hasProtectedAuthFields(item)
  ))
