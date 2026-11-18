import { api } from '../../shared/api/client'

export type BuiltInTemplateField = {
  key: string
  label: string
  required: boolean
  multiline?: boolean
  placeholder?: string
}

export type BuiltInContractTemplate = {
  id: string
  name: string
  description: string
  specialization: string
  documentType: 'contract'
  version: number
  fields: BuiltInTemplateField[]
}

export async function readBuiltInContracts() {
  const response = await api.get<{ success?: boolean; data?: BuiltInContractTemplate[] }>(
    '/document-templates/built-in'
  )
  const templates = response?.data
  if (response?.success !== true || !Array.isArray(templates) || templates.some((template) =>
    typeof template?.id !== 'string' || !template.id || typeof template.name !== 'string' ||
    typeof template.description !== 'string' || typeof template.specialization !== 'string' ||
    template.documentType !== 'contract' || !Number.isInteger(template.version) ||
    !Array.isArray(template.fields) || template.fields.some((field) =>
      typeof field?.key !== 'string' || !field.key || typeof field.label !== 'string' ||
      typeof field.required !== 'boolean')
  )) throw new Error('INVALID_BUILT_IN_TEMPLATES')
  return templates
}

export function recommendedBuiltInContracts(templates: BuiltInContractTemplate[], preset: string) {
  if (!preset) return []
  const matches = templates.filter((template) => template.specialization === preset)
  return matches.length ? matches : templates.filter((template) => template.specialization === 'other')
}
