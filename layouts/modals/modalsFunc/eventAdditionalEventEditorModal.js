import fieldHelp from '@helpers/fieldHelp.json'
import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQuery } from '@tanstack/react-query'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { isGoogleTasksDeveloper } from '@helpers/googleTasksBeta.mjs'
import GoogleAdditionalSyncFields from '@components/GoogleAdditionalSyncFields'
import DateTimePicker from '@components/DateTimePicker'
import QuickActionButtons from '@components/QuickActionButtons'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import IconCheckBox from '@components/IconCheckBox'
import Notice from '@components/Notice'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons'

const buildDefaultAdditionalEvent = () => ({
  title: '',
  description: '',
  date: new Date().toISOString(),
  done: false,
  doneAt: null,
  googleCalendarEventId: '',
})

const openEventAdditionalEventEditorModal = ({
  modalsFunc,
  index = null,
  sourceItem,
  onConfirm,
  title,
  confirmButtonName = 'Сохранить',
  declineButtonName = 'Отмена',
  introText,
  requireScheduled = false,
}) => {
  if (!modalsFunc?.add) return

  const initialSource = sourceItem
    ? { ...sourceItem }
    : buildDefaultAdditionalEvent()
  const stateRef = {
    current: {
      _id: initialSource?._id,
      googleSyncMode: initialSource?.googleSyncMode,
      googleDurationMinutes: initialSource?.googleDurationMinutes ?? 30,
      title: initialSource?.title ?? '',
      description: initialSource?.description ?? '',
      date: initialSource?.date ?? null,
      done: Boolean(initialSource?.done),
      doneAt: initialSource?.doneAt ?? null,
      googleCalendarEventId: initialSource?.googleCalendarEventId ?? '',
    },
  }

  const AdditionalEventModal = ({ setOnConfirmFunc, closeModal, setDisableConfirm }) => {
    const user = useAtomValue(loggedUserAtom)
    const developer = isGoogleTasksDeveloper(user)
    const { data: google, isLoading: googleLoading } = useQuery({
      queryKey: ['google-tasks-beta-status'], enabled: developer, staleTime: 30000,
      queryFn: async () => {
        const response = await fetch('/api/google-calendar/status')
        const result = await response.json()
        if (!result.success) throw new Error('Не удалось загрузить настройки Google')
        return result.data
      },
    })
    const showGoogle = developer && google?.connected && google?.tasksBeta?.enabled && google?.allowCalendarSync
    const [syncMode, setSyncMode] = useState(stateRef.current.googleSyncMode)
    const [duration, setDuration] = useState(stateRef.current.googleDurationMinutes)
    const effectiveMode = syncMode || (index === null && !initialSource?._id && showGoogle ? google.tasksBeta.defaultMode : 'event')
    useEffect(() => {
      setDisableConfirm?.(Boolean(developer && googleLoading) || Boolean(showGoogle && effectiveMode === 'event' &&
        (!Number.isInteger(Number(duration)) || Number(duration) < 5 || Number(duration) > 1440)))
    }, [developer, googleLoading, showGoogle, effectiveMode, duration, setDisableConfirm])
    const [localTitle, setLocalTitle] = useState(stateRef.current.title)
    const [description, setDescription] = useState(stateRef.current.description)
    const [date, setDate] = useState(stateRef.current.date)
    const [done, setDone] = useState(stateRef.current.done)
    const [saveError, setSaveError] = useState('')

    useEffect(() => {
      if (!requireScheduled) return
      setOnConfirmFunc(async () => {
        if (
          !localTitle.trim() || !date ||
          Number.isNaN(new Date(date).getTime()) || done
        ) {
          setSaveError('Укажите название и дату невыполненной задачи.')
          return
        }
        setSaveError('')
        try {
          await onConfirm({
            ...stateRef.current,
            title: localTitle.trim(),
            description: description.trim(),
            date,
            done: false,
            doneAt: null,
          })
          closeModal()
        } catch (error) {
          setSaveError(error?.message || 'Не удалось сохранить задачу.')
        }
      })
    }, [closeModal, date, description, done, localTitle, setOnConfirmFunc])

    const parseDateSafe = (value) => {
      if (!value) return null
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    const getBaseDate = () => parseDateSafe(date) || new Date()
    const applyPresetTime = (hours, minutes) => {
      const next = getBaseDate()
      next.setHours(hours, minutes, 0, 0)
      setDate(next.toISOString())
    }
    const applyPresetDateFromToday = (days) => {
      const base = getBaseDate()
      const next = new Date()
      next.setDate(next.getDate() + days)
      next.setHours(base.getHours(), base.getMinutes(), 0, 0)
      setDate(next.toISOString())
    }

    useEffect(() => {
      stateRef.current = {
        ...stateRef.current,
        googleSyncMode: effectiveMode,
        googleDurationMinutes: Number(duration),
        title: localTitle,
        description,
        date,
        done,
        doneAt: done ? stateRef.current.doneAt ?? new Date().toISOString() : null,
      }
    }, [date, description, done, localTitle, effectiveMode, duration])

    return (
      <div className="mt-2 flex flex-col gap-y-2.5">
        {saveError ? (
          <Notice tone="error" role="alert">{saveError}</Notice>
        ) : null}
        {introText ? (
          <Notice tone="info" className="rounded-md text-xs">
            {introText}
          </Notice>
        ) : null}
        <div className="mt-2 text-xs font-semibold text-gray-700">
          Быстрый заголовок
        </div>
        <QuickActionButtons
          actions={[
            {
              key: 'title-follow-up',
              label: 'Узнать что решили',
              onClick: () => setLocalTitle('Узнать что решили'),
            },
            {
              key: 'title-meeting',
              label: 'Встреча',
              onClick: () => setLocalTitle('Встреча'),
            },
            {
              key: 'title-deposit',
              label: 'Жду задаток',
              onClick: () => setLocalTitle('Жду задаток'),
            },
          ]}
        />
        <Input
          label="Заголовок"
          value={localTitle}
          onChange={setLocalTitle}
          noMargin
          fullWidth
        />
        <div className="text-xs font-semibold text-gray-700">
          Быстрая дата и время
        </div>
        <QuickActionButtons
          actions={[
            {
              key: 'time-11',
              label: '11:00',
              onClick: () => applyPresetTime(11, 0),
            },
            {
              key: 'time-19',
              label: '19:00',
              onClick: () => applyPresetTime(19, 0),
            },
            {
              key: 'date-today',
              label: 'Сегодня',
              onClick: () => applyPresetDateFromToday(0),
            },
            {
              key: 'date-tomorrow',
              label: 'Завтра',
              onClick: () => applyPresetDateFromToday(1),
            },
            {
              key: 'date-plus-2',
              label: 'Через 2 дня',
              onClick: () => applyPresetDateFromToday(3),
            },
            {
              key: 'date-plus-7',
              label: 'Через неделю',
              onClick: () => applyPresetDateFromToday(7),
            },
          ]}
        />
        <DateTimePicker
          value={date ?? null}
          onChange={(value) => setDate(value ?? null)}
          label="Дата и время"
          noMargin
        />
        <Textarea
          label="Описание"
          value={description}
          onChange={setDescription}
          rows={3}
          noMargin
        />
        {showGoogle ? <GoogleAdditionalSyncFields mode={effectiveMode} onModeChange={setSyncMode}
          duration={duration} onDurationChange={setDuration} paused={!google.enabled} authorized={google.tasksBeta.authorized} /> : null}
        <IconCheckBox
          checked={done}
          onClick={() => setDone((prev) => !prev)}
          label="Сделано"
          help={fieldHelp['event.taskDone']}
          checkedIcon={faCircleCheck}
          checkedIconColor="#16A34A"
          noMargin
        />
      </div>
    )
  }

  modalsFunc.add({
    title: title ?? `${index !== null ? 'Редактирование' : 'Создание'} задачи`,
    confirmButtonName,
    declineButtonName,
    showDecline: true,
    onConfirm: async () => {
      const nextItem = {
        _id: stateRef.current._id,
        googleSyncMode: stateRef.current.googleSyncMode,
        googleDurationMinutes: stateRef.current.googleDurationMinutes,
        title: stateRef.current.title?.trim() ?? '',
        description: stateRef.current.description?.trim() ?? '',
        date: stateRef.current.date ?? null,
        done: Boolean(stateRef.current.done),
        doneAt: stateRef.current.done
          ? stateRef.current.doneAt ?? new Date().toISOString()
          : null,
        googleCalendarEventId: stateRef.current.googleCalendarEventId ?? '',
      }
      if (typeof onConfirm === 'function') {
        await onConfirm(nextItem)
      }
    },
    Children: AdditionalEventModal,
  })
}

export default openEventAdditionalEventEditorModal
