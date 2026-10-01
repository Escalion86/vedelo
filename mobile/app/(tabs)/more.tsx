import { PageHeader, Screen } from '../../src/shared/ui/components'
import { MenuSheet } from '../../src/features/navigation/MenuSheet'

export default function MoreScreen() {
  return <Screen><PageHeader title="Меню" /><MenuSheet /></Screen>
}
