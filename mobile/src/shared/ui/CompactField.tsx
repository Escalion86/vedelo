import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useTheme, useThemeStyles } from './ThemeProvider'
import type { Palette } from './theme'

export const CompactField = ({ label, error, loading = false, search = false, style,
  editable = true, accessibilityState, onFocus, onBlur, ...props }: TextInputProps & {
  label: string
  error?: string
  loading?: boolean
  search?: boolean
}) => {
  const { palette } = useTheme()
  const styles = useThemeStyles(createStyles)
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityRole={search ? 'search' : undefined}
        placeholderTextColor={palette.cardMuted}
        keyboardAppearance={palette.mode}
        returnKeyType={search ? 'search' : undefined}
        {...props}
        // Loading a filtered list must not erase text or disable typing.
        editable={editable}
        accessibilityState={{ ...accessibilityState, disabled: !editable, busy: loading }}
        onFocus={(event) => { setFocused(true); onFocus?.(event) }}
        onBlur={(event) => { setFocused(false); onBlur?.(event) }}
        style={[styles.input, focused && styles.focused, error ? styles.invalid : null,
          !editable && styles.disabled, style]}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  wrap: { gap: 4 },
  label: { color: palette.text, fontSize: 12, fontWeight: '600' },
  input: { minHeight: 40, borderWidth: 2, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, fontSize: 16,
    color: palette.text, backgroundColor: palette.surface, borderColor: palette.border },
  focused: { borderColor: palette.primary },
  invalid: { borderColor: palette.notice.danger.border },
  error: { color: palette.notice.danger.text, fontSize: 12 },
  disabled: { opacity: 0.65 },
})
