import { useState } from 'react'
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  CompactField,
  Notice,
  Surface,
} from '../../shared/ui/components'
import { FieldHelp } from '../../shared/ui/FieldHelp'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'
import type { ProposalPackage, ProposalLine } from './api'
import { PROPOSAL_LINES_LIMIT, PROPOSAL_PACKAGES_LIMIT } from './limits'
export type CatalogService = {
  _id: string
  title: string
  description?: string
  price?: number
}
const sum = (lines: ProposalLine[]) =>
  Math.round(lines.reduce((total, line) => total + line.price, 0) * 100) / 100
const number = (value: string) =>
  /^\d+(?:[.,]\d{0,2})?$/.test(value) ? Number(value.replace(',', '.')) : NaN
const newId = () =>
  `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export function ProposalPackagesEditor({
  packages,
  services,
  onChange,
  disabled = false,
  catalogUnavailable = false,
  onPendingChange,
}: {
  packages: ProposalPackage[]
  services: CatalogService[]
  onChange: (packages: ProposalPackage[]) => void
  disabled?: boolean
  catalogUnavailable?: boolean
  onPendingChange?: (pending: boolean) => void
}) {
  const styles = useThemeStyles(createStyles)
  const [catalog, setCatalog] = useState<{
    id: string
    selected: string[]
  } | null>(null)
  const [line, setLine] = useState<{
    id: string
    index: number
    value: ProposalLine
    price: string
  } | null>(null)
  const [total, setTotal] = useState<{ id: string; value: string } | null>(null)
  const [error, setError] = useState('')
  const open = (pending: boolean) => {
    setError('')
    onPendingChange?.(pending)
  }
  const close = () => {
    setCatalog(null)
    setLine(null)
    setTotal(null)
    open(false)
  }
  const patch = (id: string, update: Partial<ProposalPackage>) => {
    if (disabled) return
    onChange(packages.map((p) => (p.id === id ? { ...p, ...update } : p)))
  }
  const lines = (id: string, value: ProposalLine[]) => {
    const item = packages.find((p) => p.id === id)
    if (item)
      patch(id, {
        lines: value,
        ...(!item.manualTotal ? { total: sum(value) } : {}),
      })
  }
  const confirm = (title: string, action: () => void) =>
    Alert.alert(title, 'Изменение будет сохранено вместе с предложением.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: action },
    ])
  return (
    <View style={styles.stack}>
      {packages.map((item) => (
        <Surface key={item.id}>
          <CompactField
            label="Название варианта"
            value={item.title}
            editable={!disabled}
            maxLength={200}
            onChangeText={(title) => patch(item.id, { title })}
          />
          <CompactField
            label="Описание варианта"
            value={item.description}
            multiline
            editable={!disabled}
            maxLength={2000}
            onChangeText={(description) => patch(item.id, { description })}
          />
          <Button
            title={
              item.recommended
                ? '✓ Рекомендуемый'
                : 'Рекомендовать этот вариант'
            }
            variant="secondary"
            disabled={disabled}
            onPress={() =>
              onChange(
                packages.map((p) => ({
                  ...p,
                  recommended: p.id === item.id ? !p.recommended : false,
                }))
              )
            }
          />
          <FieldHelp
            text={getFieldHelp('proposal.recommended')}
            label="Рекомендуемый вариант"
          />
          {item.lines.map((value, index) => (
            <View style={styles.line} key={`${index}-${value.serviceId}`}>
              <Text style={styles.text}>
                {value.title} · {value.price.toLocaleString('ru-RU')} ₽
              </Text>
              {value.description ? (
                <Text style={styles.muted}>{value.description}</Text>
              ) : null}
              {value.serviceId &&
              !services.some((s) => s._id === value.serviceId) ? (
                <Text style={styles.muted}>
                  Удалена из каталога · сохранён снимок
                </Text>
              ) : null}
              <View style={styles.row}>
                <Button
                  testID={`proposal-edit-${item.id}-${index}`}
                  title="Изменить позицию"
                  variant="secondary"
                  disabled={disabled}
                  style={styles.flex}
                  onPress={() => {
                    setLine({
                      id: item.id,
                      index,
                      value: { ...value },
                      price: String(value.price),
                    })
                    open(true)
                  }}
                />
                <Button
                  testID={`proposal-remove-${item.id}-${index}`}
                  title="Удалить позицию"
                  variant="danger"
                  disabled={disabled}
                  style={styles.flex}
                  onPress={() =>
                    confirm('Удалить позицию?', () =>
                      lines(
                        item.id,
                        item.lines.filter((_, i) => i !== index)
                      )
                    )
                  }
                />
              </View>
            </View>
          ))}
          <View style={styles.row}>
            <Button
              testID={`proposal-catalog-${item.id}`}
              title="Выбрать услуги"
              variant="secondary"
              disabled={disabled || catalogUnavailable}
              style={styles.flex}
              onPress={() => {
                setCatalog({
                  id: item.id,
                  selected: item.lines.map((l) => l.serviceId).filter(Boolean),
                })
                open(true)
              }}
            />
            <Button
              testID={`proposal-custom-${item.id}`}
              title="Добавить свою позицию"
              variant="secondary"
              disabled={disabled || item.lines.length >= PROPOSAL_LINES_LIMIT}
              style={styles.flex}
              onPress={() => {
                setLine({
                  id: item.id,
                  index: -1,
                  value: {
                    serviceId: '',
                    title: '',
                    description: '',
                    price: 0,
                  },
                  price: '0',
                })
                open(true)
              }}
            />
          </View>
          <Text style={styles.text}>
            Итого: {item.total.toLocaleString('ru-RU')} ₽ ·{' '}
            {item.manualTotal ? 'задано вручную' : 'сумма позиций'}
          </Text>
          <Button
            title={
              item.manualTotal ? 'Считать по позициям' : 'Задать итог вручную'
            }
            variant="secondary"
            disabled={disabled}
            onPress={() =>
              item.manualTotal
                ? patch(item.id, { manualTotal: false, total: sum(item.lines) })
                : (setTotal({ id: item.id, value: String(item.total) }),
                  open(true))
            }
          />
          <Button
            testID={`proposal-remove-package-${item.id}`}
            title="Удалить вариант"
            variant="danger"
            disabled={disabled || packages.length <= 1}
            onPress={() =>
              confirm('Удалить вариант?', () =>
                onChange(packages.filter((p) => p.id !== item.id))
              )
            }
          />
        </Surface>
      ))}
      <Button
        testID="proposal-add-package"
        title={`Добавить вариант (${packages.length}/${PROPOSAL_PACKAGES_LIMIT})`}
        variant="secondary"
        disabled={disabled || packages.length >= PROPOSAL_PACKAGES_LIMIT}
        onPress={() =>
          onChange([
            ...packages,
            {
              id: newId(),
              title: `Вариант ${packages.length + 1}`,
              description: '',
              lines: packages[0]?.lines.map((l) => ({ ...l })) || [],
              total: packages[0]?.total || 0,
              manualTotal: packages[0]?.manualTotal || false,
              recommended: false,
            },
          ])
        }
      />
      <Modal
        visible={Boolean(catalog || line || total)}
        animationType="slide"
        onRequestClose={close}
      >
        <ScrollView
          style={styles.modal}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          {error ? <Notice tone="danger" message={error} /> : null}
          {catalog ? (
            <>
              <Text style={styles.heading}>Услуги из каталога</Text>
              <Notice message="Свои и удалённые позиции сохраняются. Ранее выбранные услуги сохраняют ваши правки." />
              {services.length === 0 ? (
                <Text style={styles.muted}>Каталог пуст</Text>
              ) : (
                services.map((service) => (
                  <Button
                    key={service._id}
                    accessibilityLabel={`Услуга ${service.title}`}
                    accessibilityState={{
                      selected: catalog.selected.includes(service._id),
                    }}
                    title={`${catalog.selected.includes(service._id) ? '✓ ' : ''}${service.title} · ${service.price || 0} ₽`}
                    variant="secondary"
                    onPress={() =>
                      setCatalog({
                        ...catalog,
                        selected: catalog.selected.includes(service._id)
                          ? catalog.selected.filter((id) => id !== service._id)
                          : [...catalog.selected, service._id],
                      })
                    }
                  />
                ))
              )}
              <Button
                title="Применить выбор услуг"
                onPress={() => {
                  const item = packages.find((p) => p.id === catalog.id)
                  if (!item) return
                  const kept = item.lines.filter(
                    (l) =>
                      !l.serviceId ||
                      !services.some((s) => s._id === l.serviceId) ||
                      catalog.selected.includes(l.serviceId)
                  )
                  const additions = services
                    .filter(
                      (s) =>
                        catalog.selected.includes(s._id) &&
                        !kept.some((l) => l.serviceId === s._id)
                    )
                    .map((s) => ({
                      serviceId: s._id,
                      title: s.title,
                      description: s.description || '',
                      price: s.price || 0,
                    }))
                  if (kept.length + additions.length > PROPOSAL_LINES_LIMIT) {
                    setError('В варианте не более 30 позиций.')
                    return
                  }
                  lines(catalog.id, [...kept, ...additions])
                  close()
                }}
              />
              <Button
                title="Отмена выбора услуг"
                variant="secondary"
                onPress={close}
              />
            </>
          ) : null}
          {line ? (
            <>
              <Text style={styles.heading}>Позиция варианта</Text>
              <CompactField
                label="Название позиции"
                value={line.value.title}
                maxLength={300}
                onChangeText={(title) =>
                  setLine({ ...line, value: { ...line.value, title } })
                }
              />
              <CompactField
                label="Описание позиции"
                value={line.value.description}
                multiline
                maxLength={1000}
                onChangeText={(description) =>
                  setLine({ ...line, value: { ...line.value, description } })
                }
              />
              <CompactField
                label="Стоимость позиции"
                value={line.price}
                keyboardType="decimal-pad"
                onChangeText={(price) => setLine({ ...line, price })}
              />
              {line.value.serviceId ? (
                <Button
                  title="Своя позиция"
                  variant="secondary"
                  onPress={() =>
                    setLine({
                      ...line,
                      value: { ...line.value, serviceId: '' },
                    })
                  }
                />
              ) : null}
              <Button
                title="Применить позицию"
                onPress={() => {
                  const price = number(line.price)
                  if (!line.value.title.trim() || !Number.isFinite(price)) {
                    setError(
                      'Укажите название и неотрицательную стоимость (до двух знаков после запятой).'
                    )
                    return
                  }
                  const item = packages.find((p) => p.id === line.id)
                  if (!item) return
                  const value = {
                    ...line.value,
                    title: line.value.title.trim(),
                    price,
                  }
                  lines(
                    line.id,
                    line.index < 0
                      ? [...item.lines, value]
                      : item.lines.map((l, i) => (i === line.index ? value : l))
                  )
                  close()
                }}
              />
              <Button
                title="Отмена позиции"
                variant="secondary"
                onPress={close}
              />
            </>
          ) : null}
          {total ? (
            <>
              <CompactField
                label="Итоговая стоимость"
                value={total.value}
                keyboardType="decimal-pad"
                onChangeText={(value) => setTotal({ ...total, value })}
              />
              <Button
                title="Применить стоимость"
                onPress={() => {
                  const value = number(total.value)
                  if (!Number.isFinite(value)) {
                    setError('Введите неотрицательную стоимость.')
                    return
                  }
                  patch(total.id, { manualTotal: true, total: value })
                  close()
                }}
              />
              <Button
                title="Отмена стоимости"
                variant="secondary"
                onPress={close}
              />
            </>
          ) : null}
        </ScrollView>
      </Modal>
    </View>
  )
}
const createStyles = (p: Palette) =>
  StyleSheet.create({
    stack: { gap: 12 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    flex: { flexGrow: 1, flexBasis: 140 },
    line: { borderTopWidth: 1, borderColor: p.border, paddingTop: 10, gap: 6 },
    text: { fontFamily: typography.fontFamily, color: p.text, fontSize: 16 },
    muted: {
      fontFamily: typography.fontFamily,
      color: p.cardMuted,
      fontSize: 13,
    },
    heading: {
      fontFamily: typography.fontFamily,
      color: p.text,
      fontSize: 22,
      fontWeight: '700',
    },
    modal: { backgroundColor: p.canvas },
    modalContent: { padding: 20, paddingTop: 40, paddingBottom: 40, gap: 12 },
  })
