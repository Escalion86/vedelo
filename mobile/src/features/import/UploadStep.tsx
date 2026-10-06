import { Text } from 'react-native'
import { Button, CompactField, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import type { ImportController, ImportState } from './ImportController'
export function UploadStep({ controller, state }: { controller: ImportController; state: ImportState }) {
  const { palette } = useTheme()
  return <Surface>
    <SectionTitle>Из файла</SectionTitle>
    <Text style={{ color: palette.cardMuted }}>Один XLSX, CSV, TXT или DOCX до 5 МБ, до 100 записей. Сохранённые задания доступны 30 дней, максимум 20.</Text>
    <Notice message="Проверка формата и извлечение бесплатны. Анализ запускается только после подтверждения стоимости. Текст передаётся выбранному ИИ-провайдеру и хранится на сервере до 30 дней. PDF, сканы, изображения и макросы не поддерживаются." />
    {state.file ? <Text accessibilityLabel="Выбранный файл" style={{ color: palette.text }}>{state.file.name} · {state.file.size} байт</Text> : null}
    <Button title={state.file ? 'Заменить файл' : 'Выбрать файл'} onPress={controller.pick} disabled={state.busy || state.denied} variant="secondary" />
    <CompactField label="Пояснение к файлу (необязательно)" multiline maxLength={2000} value={state.note} onChangeText={(text) => controller.setNote(text)} editable={!state.busy && !state.denied} />
    <Button title="Загрузить и проверить бесплатно" onPress={controller.upload} disabled={!state.file || state.busy || state.denied} />
  </Surface>
}
