import { PageHeader, Screen } from '../../src/shared/ui/components'
import { ExportSection } from '../../src/features/import/ExportSection'

export default function ExportScreen() {
  return <Screen><PageHeader title="Экспорт" /><ExportSection /></Screen>
}
