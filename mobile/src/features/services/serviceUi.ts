import type { Service, ServiceGroup } from '../../shared/domain/types'

export const serviceCatalog = (services: Service[], groups: ServiceGroup[]) => {
  const visible = services.filter((item) => !item.archive).sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru'))
  const ordered = [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const ids = new Set(ordered.map((group) => group._id))
  return { visible, groups: ordered, ungrouped: visible.filter((item) => !item.groupId || !ids.has(item.groupId)) }
}

export type ServiceValues = { title: string; description: string; price: string; duration: string; groupId: string; order: string }
export const serviceValues = (item?: Service & ServiceGroup | null): ServiceValues => ({
  title: item?.title || '', description: item?.description || '', price: item?.price == null ? '' : String(item.price),
  duration: item?.duration == null ? '' : String(item.duration), groupId: item?.groupId || '', order: String(item?.order ?? 0),
})

// saveLocalEntity объединяет patch с кэшем и отправляет только этот patch.
// Не подставляем defaults в нетронутые поля, включая legacy images/archive.
export const servicePatch = (values: ServiceValues, initial: ServiceValues, isNew: boolean, group: boolean) => {
  if (!values.title.trim()) throw new Error(group ? 'Укажите название группы' : 'Укажите название услуги')
  const numeric = (value: string) => Number(value.trim().replace(/\s/g, '').replace(',', '.') || 0)
  const price = numeric(values.price), duration = numeric(values.duration), order = numeric(values.order)
  if (group ? !Number.isFinite(order) : !Number.isFinite(price) || price < 0 || !Number.isFinite(duration) || duration < 0) {
    throw new Error(group ? 'Порядок должен быть числом' : 'Цена и длительность должны быть неотрицательными числами')
  }
  const converted = { title: values.title.trim(), ...(group ? { order: Math.trunc(order) } : {
    description: values.description, price, duration, groupId: values.groupId || null,
  }) }
  return Object.fromEntries(Object.entries(converted).filter(([key]) => isNew || values[key as keyof ServiceValues] !== initial[key as keyof ServiceValues]))
}
