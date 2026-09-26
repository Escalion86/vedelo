'use client'

import cn from 'classnames'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
import { formatAddressPoolShort } from '@helpers/addressPool'
import Notice from './Notice'

const MIN_QUERY_LENGTH = 4
const DEBOUNCE_MS = 600
const MAX_POOL_ITEMS = 5
const CLIENT_CACHE_MAX = 50
const EMPTY_ADDRESSES = []

const hasConcreteAddress = (address) =>
  Boolean(
    address?.street ||
    address?.house ||
    address?.flat ||
    address?.room ||
    address?.comment
  )

const AddressSuggestField = ({
  address,
  onChange,
  poolAddresses = EMPTY_ADDRESSES,
  defaultTown = '',
  onManualInput,
  error,
  placeholder = 'Начните вводить адрес или выберите из своих',
}) => {
  const [mode, setMode] = useState(() =>
    hasConcreteAddress(address) ? 'view' : 'search'
  )
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestFailed, setSuggestFailed] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)

  const cacheRef = useRef(new Map())
  const selectionRef = useRef(null)
  const selectedAddressRef = useRef(null)
  const [unavailable, setUnavailable] = useState(false)
  const confirmationId = useId()

  const formattedAddress = useMemo(
    () => formatAddressPoolShort(address),
    [address]
  )
  const needsConfirmation = Boolean(
    query.trim() && query.trim() !== formattedAddress
  )
  const showConfirmation = needsConfirmation && !isOpen

  // Синхронизация режима с внешним address (AI-черновик, загрузка события)
  useEffect(() => {
    setMode(
      hasConcreteAddress(address) ||
        (address && address === selectedAddressRef.current)
        ? 'view'
        : 'search'
    )
  }, [address])

  const poolMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = normalizedQuery
      ? poolAddresses.filter((addr) =>
          formatAddressPoolShort(addr).toLowerCase().includes(normalizedQuery)
        )
      : poolAddresses
    return filtered.slice(0, MAX_POOL_ITEMS)
  }, [poolAddresses, query])

  // Строки подсказок видны только при этих условиях —
  // клавиатурный список обязан совпадать с рендером
  const showSuggestRows =
    query.trim().length >= MIN_QUERY_LENGTH && !loading && !suggestFailed

  // Плоский список опций дропдауна: единый источник для рендера и навигации
  const options = useMemo(() => {
    const list = poolMatches.map((addr) => ({ type: 'pool', payload: addr }))
    if (showSuggestRows) {
      suggestions.forEach((suggestion) => {
        list.push({ type: 'suggest', payload: suggestion })
      })
    }
    list.push({ type: 'manual' })
    return list
  }, [poolMatches, showSuggestRows, suggestions])

  // Сброс выделения при любом изменении списка опций,
  // чтобы activeIndex не мог указывать за границы списка
  const [previousOptions, setPreviousOptions] = useState(options)
  if (previousOptions !== options) {
    setPreviousOptions(options)
    setActiveIndex(-1)
  }

  useEffect(() => {
    const value = query.trim()
    // Состояние нового запроса и синхронный cache hit должны сменяться вместе.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuggestions([])
    setSuggestFailed(false)
    setLoading(false)
    if (value.length < MIN_QUERY_LENGTH || unavailable) return

    const cacheKey = JSON.stringify([
      value.toLowerCase(),
      defaultTown.trim().toLowerCase(),
    ])
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setSuggestions(cached)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/address/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: value.trim(), town: defaultTown }),
          signal: controller.signal,
        })
        const json = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        if (!res.ok || !json?.success) {
          setSuggestFailed(true)
          setSuggestions([])
          return
        }
        const data = json.data ?? {}
        if (data.unavailable) {
          setUnavailable(true)
          setSuggestions([])
          return
        }
        const next = data.suggestions ?? []
        setSuggestions(next)
        if (cacheRef.current.size >= CLIENT_CACHE_MAX) cacheRef.current.clear()
        cacheRef.current.set(cacheKey, next)
      } catch (fetchError) {
        if (!controller.signal.aborted && fetchError?.name !== 'AbortError') {
          setSuggestFailed(true)
          setSuggestions([])
        }
      } finally {
        // Отменённый запрос не трогает loading: им владеет более новый запрос
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, defaultTown, unavailable])

  // Ручное изменение, очистка и размонтирование отменяют уточнение координат.
  useEffect(() => {
    if (address !== selectedAddressRef.current) selectionRef.current?.abort()
  }, [address])
  useEffect(() => () => selectionRef.current?.abort(), [])

  const handleSelectPool = (addr) => {
    selectionRef.current?.abort()
    const nextAddress = { ...addr }
    selectedAddressRef.current = nextAddress
    onChange?.(nextAddress)
    setMode('view')
    setIsOpen(false)
    setQuery('')
  }

  const handleSelectSuggestion = async (suggestion) => {
    selectionRef.current?.abort()
    const controller = new AbortController()
    selectionRef.current = controller
    const nextAddress = { ...address, ...suggestion.address }
    selectedAddressRef.current = nextAddress
    onChange?.(nextAddress)
    setMode('view')
    setIsOpen(false)
    setQuery('')
    // Уточняющий запрос ради координат; при ошибке — адрес из подсказки
    try {
      const res = await fetch('/api/address/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'select', query: suggestion.label }),
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null)
      if (controller.signal.aborted) return
      const selected = json?.success ? json?.data?.selected : null
      if (selected?.address) {
        const refinedAddress = { ...nextAddress, ...selected.address }
        selectedAddressRef.current = refinedAddress
        onChange?.(refinedAddress)
      }
    } catch {
      // Адрес уже выбран; ошибка уточнения координат не должна его очищать.
    }
  }

  const handleSelectOption = (option) => {
    if (option.type === 'pool') handleSelectPool(option.payload)
    else if (option.type === 'suggest') handleSelectSuggestion(option.payload)
    else {
      selectionRef.current?.abort()
      setIsOpen(false)
      onManualInput?.()
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }
    if (!isOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      // Блокируем неявный submit формы всегда, пока открыт дропдаун
      event.preventDefault()
      if (activeIndex >= 0 && options[activeIndex]) {
        handleSelectOption(options[activeIndex])
      }
    }
  }

  const optionClassName = (index) =>
    cn(
      'address-suggest-option flex min-h-[48px] w-full cursor-pointer items-center px-3 text-left text-sm',
      index === activeIndex && 'address-suggest-option--active'
    )

  if (mode === 'view') {
    return (
      <div className="flex flex-col gap-y-1">
        <div className="border-input flex min-h-[40px] items-center gap-x-2 rounded border-2 bg-white px-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {formattedAddress}
          </span>
          <button
            type="button"
            title="Изменить адрес"
            className="hover:text-general flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center p-1.5 text-gray-500"
            onClick={() => {
              selectionRef.current?.abort()
              setQuery(formattedAddress)
              setMode('search')
              setIsOpen(true)
            }}
          >
            <FontAwesomeIcon icon={faPencilAlt} className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Очистить адрес"
            className="flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center p-1.5 text-gray-500 hover:text-red-500"
            onClick={() => {
              selectionRef.current?.abort()
              selectedAddressRef.current = null
              setQuery('')
              setIsOpen(false)
              onChange?.(null)
            }}
          >
            <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
          </button>
        </div>
        {error && <div className="text-xs text-red-500">{error}</div>}
        <button
          type="button"
          className="text-general cursor-pointer self-start text-sm hover:underline"
          onClick={() => onManualInput?.()}
        >
          Дополнить адрес
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false)
      }}
    >
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        aria-describedby={showConfirmation ? confirmationId : undefined}
        className={cn(
          'min-h-[40px] w-full rounded border-2 bg-white px-2 py-1 text-sm outline-none',
          error ? 'border-danger' : 'border-input focus:border-general'
        )}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          selectionRef.current?.abort()
          setQuery(event.target.value)
          setActiveIndex(-1)
          setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {error && <div className="mt-1 text-xs text-red-500">{error}</div>}
      {showConfirmation && (
        <Notice tone="warning" className="mt-1 text-sm" id={confirmationId}>
          <div>
            Текст ещё не подтверждён. Выберите адрес из списка или нажмите
            «Использовать введённый текст».
          </div>
          <div className="mt-1">
            {hasConcreteAddress(address)
              ? 'Без подтверждения сохранится прежний адрес.'
              : 'Без подтверждения введённый текст не сохранится в адресе.'}
          </div>
          <button
            type="button"
            className="min-h-[44px] cursor-pointer py-2 text-left font-semibold underline"
            onClick={() => handleSelectPool({ comment: query.trim() })}
          >
            Использовать введённый текст
          </button>
        </Notice>
      )}
      {isOpen && (
        <div className="absolute right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
          {poolMatches.length > 0 && (
            <div className="px-3 pt-2 text-xs font-semibold text-gray-400">
              Мои адреса
            </div>
          )}
          {/* Строки рендерятся ровно из options: сначала пул, затем подсказки и «Ввести вручную» */}
          {options.slice(0, poolMatches.length).map((option, index) => (
            <button
              key={`pool-${index}-${formatAddressPoolShort(option.payload)}`}
              type="button"
              className={optionClassName(index)}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => handleSelectOption(option)}
            >
              {formatAddressPoolShort(option.payload)}
            </button>
          ))}
          {query.trim().length >= MIN_QUERY_LENGTH && (
            <>
              {loading && (
                <div className="px-3 py-3 text-sm text-gray-400">Поиск…</div>
              )}
              {!loading && suggestFailed && (
                <div className="px-3 py-3 text-sm text-gray-500">
                  Подсказки временно недоступны
                </div>
              )}
              {!loading &&
                !suggestFailed &&
                suggestions.length === 0 &&
                !unavailable && (
                  <div className="px-3 py-3 text-sm text-gray-500">
                    Ничего не найдено
                  </div>
                )}
            </>
          )}
          {query.trim().length < MIN_QUERY_LENGTH &&
            poolMatches.length === 0 && (
              <div className="px-3 py-3 text-sm text-gray-500">
                Введите улицу и дом, например: Ленинградская 12
              </div>
            )}
          {options.slice(poolMatches.length).map((option, offset) => {
            const index = poolMatches.length + offset
            if (option.type === 'manual') {
              return (
                <button
                  key="manual"
                  type="button"
                  className={cn(
                    optionClassName(index),
                    'text-general border-t border-gray-100'
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={() => handleSelectOption(option)}
                >
                  Ввести вручную
                </button>
              )
            }
            return (
              <button
                key={`suggest-${option.payload.label}`}
                type="button"
                className={optionClassName(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => handleSelectOption(option)}
              >
                {option.payload.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AddressSuggestField
