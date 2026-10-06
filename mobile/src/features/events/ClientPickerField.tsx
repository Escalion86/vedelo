import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Client } from '../../shared/domain/types'
import { formatPhoneForDisplay } from '../../shared/format/phone'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { clientDisplayName, searchClients } from './clientSearch'

const MAX_VISIBLE_OPTIONS = 20

export type ClientPickerFieldProps = {
  label: string
  value: string
  clients: Client[]
  /** Основной и дополнительные контакты не должны повторяться: исключаем занятые id. */
  excludeIds?: readonly string[]
  allowEmpty?: boolean
  onChange: (clientId: string) => void
  onEdit?: (clientId: string) => void
  testID?: string
}

export const ClientPickerField = ({
  label, value, clients, excludeIds = [], allowEmpty = false, onChange, onEdit, testID,
}: ClientPickerFieldProps) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const available = useMemo(() => clients.filter((client) => !excluded.has(client._id)), [clients, excluded])
  const matches = useMemo(() => searchClients(available, query), [available, query])
  const visible = matches.slice(0, MAX_VISIBLE_OPTIONS)
  const selected = value ? clients.find((client) => client._id === value) : undefined
  const searching = !value || editing
  const select = (clientId: string) => {
    onChange(clientId)
    setEditing(false)
    setQuery('')
  }
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {!searching ? (
        <View style={styles.selectedRow}>
          <Text numberOfLines={1} style={styles.selectedName} testID={testID ? `${testID}-value` : undefined}>
            {selected ? clientDisplayName(selected) : 'Клиент недоступен'}
          </Text>
          {onEdit ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Редактировать клиента"
              hitSlop={8} onPress={() => onEdit(value)} style={styles.iconButton}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={palette.notice.warning.text} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.linkButton}>
            <Text style={styles.linkText}>Сменить</Text>
          </Pressable>
          {allowEmpty ? (
            <Pressable accessibilityRole="button" onPress={() => select('')} style={styles.linkButton}>
              <Text style={styles.linkText}>Очистить выбор</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.searchArea}>
          <TextInput
            accessibilityLabel="Поиск клиента"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Имя, телефон или соцсеть"
            placeholderTextColor={palette.cardMuted}
            keyboardAppearance={palette.mode}
            style={styles.search}
            testID={testID ? `${testID}-search` : undefined}
            value={query}
          />
          {visible.map((client) => (
            <Pressable
              accessibilityRole="button"
              key={client._id}
              onPress={() => select(client._id)}
              style={styles.option}
              testID={testID ? `${testID}-option-${client._id}` : undefined}
            >
              <Text numberOfLines={1} style={styles.optionName}>{clientDisplayName(client)}</Text>
              {formatPhoneForDisplay(client.phone) ? (
                <Text style={styles.optionMeta}>{formatPhoneForDisplay(client.phone)}</Text>
              ) : null}
            </Pressable>
          ))}
          {!visible.length ? <Text style={styles.muted}>Ничего не найдено</Text> : null}
          {matches.length > visible.length ? (
            <Text style={styles.muted}>Показаны первые {MAX_VISIBLE_OPTIONS}. Уточните запрос.</Text>
          ) : null}
        </View>
      )}
    </View>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: palette.text, fontSize: 13, fontWeight: '600' },
  selectedRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, minHeight: 48 },
  selectedName: { color: palette.text, flexShrink: 1, fontSize: 16, fontWeight: '600' },
  iconButton: { alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 40 },
  linkButton: { paddingVertical: 6 },
  linkText: { color: palette.primary, fontSize: 14, fontWeight: '600' },
  searchArea: { gap: 6 },
  search: {
    backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 8, borderWidth: 1,
    color: palette.text, fontSize: 16, minHeight: 48, paddingHorizontal: 12,
  },
  option: { borderColor: palette.border, borderRadius: 8, borderWidth: 1, gap: 2, paddingHorizontal: 12, paddingVertical: 8 },
  optionName: { color: palette.text, fontSize: 15, fontWeight: '600' },
  optionMeta: { color: palette.cardMuted, fontSize: 13 },
  muted: { color: palette.cardMuted, fontSize: 13 },
})
