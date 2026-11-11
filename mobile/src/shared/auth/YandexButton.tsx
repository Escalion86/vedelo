import { ActivityIndicator, Image, Pressable, StyleSheet, Text } from 'react-native'
import { env } from '../config/env'

const logo = env.apiBaseUrl?.replace(/\/api\/?$/, '') + '/icons/yandex-id-original.png'

export function YandexButton({ title = 'Войти с Яндекс ID', disabled, loading, onPress, testID }: {
  title?: string; disabled?: boolean; loading?: boolean; onPress: () => void; testID?: string
}) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
    disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, pressed && styles.pressed, (disabled || loading) && styles.disabled]}>
    {loading ? <ActivityIndicator color="#fff" /> : <Image source={{ uri: logo }} accessible={false} style={styles.logo} />}
    <Text style={styles.title}>{title}</Text>
  </Pressable>
}

const styles = StyleSheet.create({
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#555', backgroundColor: '#1a1a1a' },
  pressed: { backgroundColor: '#333' },
  disabled: { opacity: 0.65 },
  logo: { width: 28, height: 28, resizeMode: 'contain' },
  title: { color: '#fff', fontWeight: '600', fontSize: 16, flexShrink: 1 },
})
