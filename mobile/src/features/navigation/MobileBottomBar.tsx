import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { router, usePathname } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useCachedEntities } from '../../shared/hooks/useCachedEntities'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import type { Event } from '../../shared/domain/types'
import { createWorkItemRoute } from '../events/createOptions'
import { MenuSheet } from './MenuSheet'
import { EventsSubmenu } from './EventsSubmenu'
import { CreateWorkItemMenu } from './CreateWorkItemMenu'
import { useEventsScope } from './EventsScope'
import { badgeLabel, isMenuRoute, type MenuItem } from './menu'
import { bottomSlots, countOverdueTasks, type BottomSlot } from './bottomBar'

type Panel = 'events' | 'create' | 'menu' | null
const icons: Record<BottomSlot, MenuItem['icon']> = {
  attention: 'alert-circle-outline', events: 'calendar-blank-outline', create: 'plus',
  clients: 'account-group-outline', menu: 'menu',
}

export function MobileBottomBar({ state, navigation }: BottomTabBarProps) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const path = usePathname()
  const terms = useWorkItemTerminology()
  const scope = useEventsScope()
  const events = useCachedEntities<Event>('events').data || []
  const overdue = countOverdueTasks(events)
  const [panel, setPanel] = useState<Panel>(null)
  const [barHeight, setBarHeight] = useState(60 + insets.bottom)
  const activeRoute = state.routes[state.index]?.name
  const labels: Record<BottomSlot, string> = {
    attention: 'Важное', events: terms.pluralCapitalized, create: 'Создать', clients: 'Клиенты', menu: 'Меню',
  }

  useEffect(() => { setPanel(null) }, [path, state.index, state.key])
  const close = () => setPanel(null)
  const navigate = (href: string) => { close(); router.navigate(href as never) }
  const pressSlot = (slot: BottomSlot) => {
    if (slot === 'events' || slot === 'create' || slot === 'menu') {
      setPanel((current) => current === slot ? null : slot)
    } else {
      close()
      const name = slot === 'attention' ? 'index' : 'clients'
      const route = state.routes.find((item) => item.name === name)
      if (route) {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
        if (!event.defaultPrevented) navigation.navigate(name)
      }
    }
  }
  const isSelected = (slot: BottomSlot) => {
    if (panel) return slot === panel
    return slot === 'attention' ? activeRoute === 'index'
      : slot === 'events' ? activeRoute === 'events'
        : slot === 'clients' ? activeRoute === 'clients'
          : slot === 'menu' && isMenuRoute(path)
  }
  const bar = (overlay: boolean) => <View testID={overlay ? 'overlay-bottom-bar' : 'mobile-bottom-bar'}
    onLayout={overlay ? undefined : (event) => setBarHeight(event.nativeEvent.layout.height)}
    style={[styles.bar, { paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
    {bottomSlots.map((slot) => <Pressable key={slot} testID={`bottom-slot-${slot}`}
      accessibilityRole={slot === 'attention' || slot === 'clients' ? 'tab' : 'button'}
      accessibilityLabel={labels[slot]}
      accessibilityState={{ selected: isSelected(slot), ...(slot === 'events' || slot === 'create' || slot === 'menu' ? { expanded: panel === slot } : {}) }}
      onPress={() => pressSlot(slot)} style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
      <View style={slot === 'create' ? styles.fab : undefined}>
        <MaterialCommunityIcons name={icons[slot]} size={30}
          color={slot === 'create' ? palette.fabForeground : isSelected(slot) ? palette.navigationActive : palette.navigationText} />
        {slot === 'attention' && overdue > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badgeLabel(overdue)}</Text></View> : null}
      </View>
      {slot !== 'create' ? <Text style={[styles.label, { color: isSelected(slot) ? palette.navigationActive : palette.navigationText }]}>{labels[slot]}</Text> : null}
    </Pressable>)}
  </View>

  return <>
    <View accessibilityElementsHidden={panel !== null} importantForAccessibility={panel ? 'no-hide-descendants' : 'auto'}>{bar(false)}</View>
    <Modal visible={panel !== null} transparent statusBarTranslucent navigationBarTranslucent
      animationType="none" onRequestClose={close}>
      {panel ? <View style={styles.modal} accessibilityViewIsModal>
        <Pressable testID="navigation-backdrop" accessibilityRole="button" accessibilityLabel="Закрыть меню"
          style={styles.backdrop} onPress={close} />
        <View style={[styles.panel, { bottom: barHeight + 8, left: 8 + insets.left, right: 8 + insets.right,
          maxHeight: Math.max(0, (height - insets.top - barHeight - 16) * 0.62) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {panel === 'menu' ? <MenuSheet onNavigate={navigate} activePath={path} /> : null}
            {panel === 'events' ? <View style={styles.panelContent}><EventsSubmenu scope={scope.filter}
              onSelect={(value) => { scope.selectScope(value); navigate('/(tabs)/events') }} /></View> : null}
            {panel === 'create' ? <View style={styles.panelContent}><CreateWorkItemMenu
              onSelect={(choice) => { close(); router.push(createWorkItemRoute(choice)) }} /></View> : null}
          </ScrollView>
        </View>
        <View style={styles.overlayBar}>{bar(true)}</View>
      </View> : null}
    </Modal>
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: palette.navigationBackground },
  slot: { flex: 1, minHeight: 60, paddingVertical: 6, paddingHorizontal: 2, gap: 3, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, lineHeight: 12, textAlign: 'center', fontWeight: '600' },
  fab: { width: 50, height: 50, marginTop: -16, borderRadius: 999, backgroundColor: palette.fabBackground, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  badge: { position: 'absolute', right: -10, top: -3, minWidth: 18, minHeight: 18, borderRadius: 999, paddingHorizontal: 4, alignItems: 'center', backgroundColor: palette.transactionExpense },
  badgeText: { color: palette.transactionExpenseText, fontSize: 10, fontWeight: '700' },
  modal: { flex: 1 }, backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: { position: 'absolute', borderRadius: 16, overflow: 'hidden', backgroundColor: palette.canvas },
  panelContent: { padding: 6 }, overlayBar: { position: 'absolute', bottom: 0, left: 0, right: 0 },
})
