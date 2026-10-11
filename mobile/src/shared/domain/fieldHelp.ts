// Генерируемая JSON-копия находится внутри корня Metro; конфигурация сборки не меняется.
import texts from './fieldHelp.generated.json'

export type FieldHelpKey = keyof typeof texts
export const fieldHelpTexts = texts
export const getFieldHelp = (key: FieldHelpKey): string => texts[key]
