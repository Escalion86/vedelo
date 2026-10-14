import type { PropsWithChildren, ReactNode } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type ViewStyle, type ViewProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { radius, spacing, surfaceElevation, surfaceShadow, typography, type Palette, type TemporalStatus, type EventViewStatus } from './theme'
import { useTheme, useThemeStyles } from './ThemeProvider'
import { Notice } from './Notice'
import { FieldHelp, HelpLabel } from './FieldHelp'

export { FieldHelp, HelpLabel } from './FieldHelp'

export { Notice } from './Notice'
export { CompactField } from './CompactField'
export { FilterOverlay, FilterControl } from './FilterOverlay'

export const Screen = ({ children, scroll = true, contentStyle, keyboardShouldPersistTaps }: PropsWithChildren<{
  scroll?: boolean; contentStyle?: StyleProp<ViewStyle>; keyboardShouldPersistTaps?: 'always' | 'never' | 'handled'
}>) => {
  const styles = useThemeStyles(createStyles)
  const content = <View style={[styles.screenContent, contentStyle]}>{children}</View>
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} contentContainerStyle={styles.scrollContent}>{content}</ScrollView> : content}
    </SafeAreaView>
  )
}

export const PageHeader = ({ title, help, count, subtitle, action }: {
  title: string; help?: string; count?: number | string; subtitle?: string; action?: ReactNode
}) => {
  const styles = useThemeStyles(createStyles)
  return (
    <View testID="page-header" style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        <View style={styles.pageTitleRow}>
          <Text accessibilityRole="header" accessibilityLabel={title} numberOfLines={1} style={styles.pageTitle}>{title}</Text>
          {help ? <FieldHelp key={title} text={help} label={title} /> : null}
          {count != null ? <Text style={styles.pageCount}>{count}</Text> : null}
        </View>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  )
}

export const Surface = ({ children, style, variant = 'card', ...props }: PropsWithChildren<ViewProps & {
  variant?: 'card' | 'toolbar' | 'kpi'
}>) => {
  const styles = useThemeStyles(createStyles)
  return <View {...props} style={[styles.surface, styles[variant], style]}>{children}</View>
}

export const SectionTitle = ({ children, help }: PropsWithChildren<{ help?: string }>) => {
  const styles = useThemeStyles(createStyles)
  if (!help) return <Text style={styles.sectionTitle}>{children}</Text>
  return <HelpLabel label={String(children)} help={help} style={styles.sectionTitle} />
}

export type ButtonProps = PressableProps & {
  title: string
  loading?: boolean
  loadingTitle?: string
  variant?: 'primary' | 'secondary' | 'danger'
}

export const Button = ({ title, loading = false, loadingTitle, variant = 'primary',
  disabled, style, accessibilityState, ...props }: ButtonProps) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const blocked = Boolean(disabled || loading)
  // Danger is a semantic outline action, not a transaction-expense button.
  const foreground = (pressed: boolean) => variant === 'secondary'
    ? pressed ? palette.secondaryPressedText : palette.secondaryText
    : variant === 'danger' ? palette.notice.danger.text : palette.onPrimary
  return (
    <Pressable
      hitSlop={4}
      {...props}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: blocked, busy: loading }}
      disabled={blocked}
      style={(state) => [
        styles.button,
        variant === 'primary' && { backgroundColor: state.pressed && !blocked ? palette.primaryPressed : palette.primary },
        variant === 'secondary' && {
          backgroundColor: state.pressed && !blocked ? palette.secondaryPressedBackground : palette.secondaryBackground,
          borderWidth: 1,
          borderColor: state.pressed && !blocked ? palette.secondaryPressedBorder : palette.secondaryBorder,
        },
        variant === 'danger' && { backgroundColor: palette.notice.danger.background, borderColor: palette.notice.danger.border, borderWidth: 1 },
        variant === 'danger' && state.pressed && !blocked && styles.dangerPressed,
        blocked && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {({ pressed }) => (
        <View style={styles.buttonContent}>
          {loading ? <ActivityIndicator color={foreground(false)} /> : null}
          <Text style={[styles.buttonText, { color: foreground(pressed && !blocked) }]}>
            {loading && loadingTitle ? loadingTitle : title}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export const Field = ({ label, help, error, style, ...props }: TextInputProps & { label: string; help?: string; error?: string }) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return (
    <View style={styles.fieldWrap}>
      <HelpLabel label={label} help={help} style={styles.fieldLabel} />
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.cardMuted}
        keyboardAppearance={palette.mode}
        {...props}
        style={[styles.field, error ? styles.fieldError : null, props.multiline && styles.fieldMultiline, style]}
      />
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
    </View>
  )
}

type LegacyChipTone = 'success' | 'warning' | 'danger' | 'blue'
export const StatusChip = ({ label, tone = 'neutral', eventStatus }: {
  label: string
  tone?: TemporalStatus | LegacyChipTone
  /** finished is presentation only, never a persisted API status. */
  eventStatus?: EventViewStatus
}) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const legacyTone = { success: 'success', warning: 'warning', danger: 'danger', blue: 'info' } as const
  const role = eventStatus ? palette.eventViewStatus[eventStatus]
    : tone in legacyTone ? palette.notice[legacyTone[tone as LegacyChipTone]]
      : palette.status[tone as TemporalStatus]
  return (
    <View accessible accessibilityLabel={label} style={[styles.chip, { backgroundColor: role.background, borderColor: role.border }]}>
      <Text style={[styles.chipText, { color: role.text }]}>{label}</Text>
    </View>
  )
}

export const EmptyState = ({ title, description, icon, action }: {
  title: string
  description?: string
  icon?: ReactNode
  action?: { title: string; onPress: NonNullable<PressableProps['onPress']>; disabled?: boolean; loading?: boolean }
}) => {
  const styles = useThemeStyles(createStyles)
  return (
    <View style={styles.empty}>
      {icon ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {action ? <Button {...action} style={styles.emptyAction} /> : null}
    </View>
  )
}

export const ErrorNotice = ({ message }: { message: string }) => <Notice tone="danger" message={message} />

const createStyles = (palette: Palette) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  scrollContent: { flexGrow: 1 },
  screenContent: { flex: 1, gap: spacing.lg, padding: spacing.lg, paddingBottom: 96 },
  pageHeader: { minHeight: 64, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 7, borderBottomWidth: 1, borderColor: palette.border, backgroundColor: palette.headerBackground, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pageHeaderText: { flex: 1, minWidth: 0 },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pageTitle: { fontFamily: typography.fontFamily, color: palette.headerTitleColor, fontSize: 16, lineHeight: 24, fontWeight: typography.nativePageTitleWeight, flexShrink: 1 },
  pageCount: { fontFamily: typography.fontFamily, color: palette.primary, fontSize: 12, lineHeight: 16, fontWeight: '600', flexShrink: 0 },
  pageSubtitle: { fontFamily: typography.fontFamily, color: palette.cardMuted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  surface: { borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 8, elevation: surfaceElevation[palette.mode], ...surfaceShadow[palette.mode] },
  toolbar: { backgroundColor: palette.toolbarBackground, borderColor: palette.toolbarBorder, borderRadius: 0 },
  kpi: { backgroundColor: palette.kpiBackground, borderColor: palette.kpiBorder, borderRadius: 8, padding: spacing.sm },
  sectionTitle: { fontFamily: typography.fontFamily, color: palette.text, fontSize: 17, fontWeight: '700' },
  button: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  dangerPressed: { opacity: 0.82 },
  disabled: { opacity: 0.65 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonText: { fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontFamily: typography.fontFamily, color: palette.text, fontSize: 13, fontWeight: '600' },
  field: { fontFamily: typography.fontFamily, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, color: palette.text, backgroundColor: palette.surface, paddingHorizontal: spacing.md, fontSize: 16 },
  fieldMultiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  fieldError: { borderColor: palette.notice.danger.border },
  errorText: { fontFamily: typography.fontFamily, color: palette.notice.danger.text, fontSize: 12 },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24, gap: spacing.sm },
  emptyIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: palette.emptyIconBackground, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: typography.fontFamily, color: palette.cardTitle, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyDescription: { fontFamily: typography.fontFamily, color: palette.cardMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyAction: { marginTop: spacing.sm },
})
