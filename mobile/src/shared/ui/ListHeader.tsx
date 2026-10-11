import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { MobileUser } from '../auth/types'
import { useThemeStyles } from './ThemeProvider'
import { typography, type Palette } from './theme'

// CabinetHeader's mobile geometry, scoped to list screens.
export function ListHeader({ title, count, user }: { title: string; count: number; user: MobileUser | null }) {
  const styles = useThemeStyles(createStyles)
  return <View style={styles.header}>
    <View testID="list-header-title-row" style={styles.titleRow}>
      <Text accessibilityRole="header" accessibilityLabel={title} numberOfLines={1} style={styles.title}>{title}</Text>
      <Text style={styles.count}>{count}</Text>
    </View>
    {user ? <Pressable accessibilityRole="button" accessibilityLabel="Открыть профиль" style={styles.profile}
      onPress={() => router.push('/(tabs)/profile' as never)}>
      {user.images?.[0] ? <Image accessibilityLabel="Аватар профиля" source={{ uri: user.images[0] }} style={styles.avatar} />
        : <Text style={styles.initial}>{(user.firstName || user.phone || '?').slice(0, 1).toUpperCase()}</Text>}
    </Pressable> : null}
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  header: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderColor: palette.border, backgroundColor: palette.headerBackground },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontFamily: typography.fontFamily, flexShrink: 1, color: palette.cardTitle, fontSize: 16, fontWeight: '600' },
  count: { fontFamily: typography.fontFamily, flexShrink: 0, color: palette.primary, fontSize: 12, fontWeight: '600' },
  profile: { width: 40, height: 40, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emptyIconBackground },
  avatar: { width: 40, height: 40 }, initial: { fontFamily: typography.fontFamily, fontSize: 20, fontWeight: '600', color: palette.primary },
})
