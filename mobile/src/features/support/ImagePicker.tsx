import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, View, Text } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Button } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import type { SelectedSupportImage } from './types'
import { validateSelectedSupportImages } from './files'
import { copyImage } from '../profile/nativeImage'
import { useScreenLifetime } from '../profile/useScreenLifetime'

export function SupportImagePicker({ images, onChange, onError, disabled = false }: { images: SelectedSupportImage[]; onChange: (images: SelectedSupportImage[]) => void; onError: (message: string) => void; disabled?: boolean }) {
  const { palette } = useTheme(), styles = useThemeStyles(createStyles), capture = useScreenLifetime()
  const owned = useRef(new Map<string, ReturnType<typeof copyImage>>()), lock = useRef(false)
  const latest = useRef(images); latest.current = images
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    for (const [uri, copy] of owned.current) if (!images.some((image) => image.uri === uri)) { copy.dispose(); owned.current.delete(uri) }
  }, [images])
  useEffect(() => () => { for (const copy of owned.current.values()) copy.dispose(); owned.current.clear() }, [])
  const pick = async () => {
    if (disabled || lock.current) return
    lock.current = true; setPicking(true)
    const current = capture(), copies: ReturnType<typeof copyImage>[] = []
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg','image/png','image/webp'], multiple: true, copyToCacheDirectory: false })
      if (result.canceled || !current()) return
      const selected = result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || '', size: asset.size || 0 }))
      const validation = validateSelectedSupportImages(latest.current, selected)
      if (!validation.ok) { onError(validation.error); return }
      const local = selected.map((image) => { const copy = copyImage(image.uri, image.name); copies.push(copy); return { ...image, uri: copy.uri } })
      if (!current()) return
      for (const copy of copies) owned.current.set(copy.uri, copy)
      onError(''); onChange([...latest.current, ...local])
      copies.length = 0
    } catch { if (current()) onError('Не удалось выбрать изображения') }
    finally { for (const copy of copies) copy.dispose(); lock.current = false; if (current()) setPicking(false) }
  }
  return <View style={styles.wrapper}><View style={styles.previews}>{images.map((image, index) => <View key={`${image.uri}-${index}`} style={styles.preview}>
    <Image source={{ uri: image.uri }} style={styles.image} accessibilityLabel={image.name} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Удалить ${image.name}`} accessibilityState={{ disabled: disabled || picking }} disabled={disabled || picking} style={[styles.remove, { backgroundColor: palette.notice.danger.background }]} onPress={() => onChange(images.filter((_, i) => i !== index))}><Text style={{ color: palette.notice.danger.text }}>Удалить</Text></Pressable>
  </View>)}</View>{images.length < 5 ? <Button title="Прикрепить изображения" variant="secondary" onPress={pick} disabled={disabled} loading={picking} /> : null}<Text style={styles.hint}>JPEG, PNG или WebP · до 5 файлов по 10 МБ</Text></View>
}
const createStyles = (palette: Palette) => StyleSheet.create({ wrapper: { gap: 8 }, previews: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, preview: { width: 100, height: 112, borderRadius: 6, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }, image: { width: 100, height: 72 }, remove: { minHeight: 40, alignItems: 'center', justifyContent: 'center' }, hint: { color: palette.cardMuted, fontSize: 12 } })
