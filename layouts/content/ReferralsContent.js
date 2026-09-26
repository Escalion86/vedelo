'use client'

import Button from '@components/Button'
import LoadingSpinner from '@components/LoadingSpinner'
import MutedText from '@components/MutedText'
import formatDate from '@helpers/formatDate'
import { formatMoney } from '@helpers/formatMoney'
import useSnackbar from '@helpers/useSnackbar'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { useAtomValue } from 'jotai'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

const DEFAULT_PERCENT = 5

const getUserName = (user) => {
  const name = [user?.secondName, user?.firstName, user?.thirdName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return name || 'Пользователь'
}

const ReferralsContent = () => {
  const router = useRouter()
  const loggedUser = useAtomValue(loggedUserAtom)
  const snackbar = useSnackbar()
  const [origin, setOrigin] = useState('')
  const [percent, setPercent] = useState(DEFAULT_PERCENT)
  const [qrSrc, setQrSrc] = useState('')
  const [isQrLoading, setIsQrLoading] = useState(false)
  const [qrErrorText, setQrErrorText] = useState('')
  const [referralsData, setReferralsData] = useState(null)
  const [isReferralsLoading, setIsReferralsLoading] = useState(true)
  const [referralsErrorText, setReferralsErrorText] = useState('')

  const loggedUserId = loggedUser?._id ? String(loggedUser._id) : ''
  const qrServiceBaseUrl = (
    process.env.NEXT_PUBLIC_QR_SERVICE_URL || 'https://qr.escalion.ru'
  ).replace(/\/$/, '')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Фактический origin браузера неизвестен при серверном рендере.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrigin(window.location.origin)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadReferrals = async () => {
      if (!loggedUserId) return
      setIsReferralsLoading(true)
      setReferralsErrorText('')
      try {
        const response = await fetch('/api/referrals', {
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || 'Не удалось загрузить рефералов')
        }
        if (!cancelled) setReferralsData(result?.data ?? null)
      } catch (error) {
        if (!cancelled) {
          setReferralsErrorText(
            error?.message || 'Не удалось загрузить рефералов'
          )
        }
      } finally {
        if (!cancelled) setIsReferralsLoading(false)
      }
    }

    loadReferrals()

    return () => {
      cancelled = true
    }
  }, [loggedUserId])

  useEffect(() => {
    let cancelled = false

    const loadReferralSettings = async () => {
      try {
        const response = await fetch('/api/site/referral', {
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result?.success === false) return
        const nextPercent = Number(result?.data?.percent ?? DEFAULT_PERCENT)
        if (!cancelled && Number.isFinite(nextPercent)) {
          setPercent(nextPercent)
        }
      } catch {
        if (!cancelled) setPercent(DEFAULT_PERCENT)
      }
    }

    loadReferralSettings()

    return () => {
      cancelled = true
    }
  }, [])

  const referralPath = useMemo(() => {
    if (!loggedUserId) return ''
    return `/login?mode=register&ref=${encodeURIComponent(loggedUserId)}`
  }, [loggedUserId])

  const referralLink = useMemo(() => {
    if (!referralPath) return ''
    return origin ? `${origin}${referralPath}` : referralPath
  }, [origin, referralPath])

  useEffect(() => {
    if (!referralLink) return undefined

    const controller = new AbortController()
    let objectUrl = ''

    const fetchQr = async () => {
      setIsQrLoading(true)
      setQrSrc('')
      setQrErrorText('')

      try {
        const response = await fetch(`${qrServiceBaseUrl}/api/v1/qr/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'url',
            data: { url: referralLink },
            options: {
              width: 300,
              margin: 2,
              errorCorrectionLevel: 'H',
            },
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`QR service response error: ${response.status}`)
        }

        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        setQrSrc(objectUrl)
      } catch (error) {
        if (controller.signal.aborted) return
        setQrErrorText(error?.message || 'Не удалось загрузить QR-код')
      } finally {
        if (!controller.signal.aborted) setIsQrLoading(false)
      }
    }

    fetchQr()

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [qrServiceBaseUrl, referralLink])

  const copyLink = useCallback(async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      snackbar.success('Реферальная ссылка скопирована')
    } catch {
      snackbar.error('Не удалось скопировать ссылку')
    }
  }, [referralLink, snackbar])

  if (!loggedUserId) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner text="Загрузка профиля..." />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                Ваша реферальная ссылка
              </div>
              <MutedText as="p" className="mt-1 text-gray-500">
                Поделитесь ссылкой с новым пользователем. После регистрации по
                ней вы будете получать {percent}% от каждого его пополнения
                баланса.
              </MutedText>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm break-all text-gray-800">
              {referralLink}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                name="Скопировать ссылку"
                onClick={copyLink}
                disabled={!referralLink}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-lg font-semibold text-gray-900">QR-код</div>
            <div className="flex aspect-square w-full max-w-[300px] items-center justify-center self-center rounded-lg border border-gray-200 bg-gray-50 p-3">
              {isQrLoading ? (
                <LoadingSpinner size="sm" text="Загружаем QR..." />
              ) : qrSrc ? (
                <Image
                  src={qrSrc}
                  alt="QR-код реферальной ссылки"
                  width={300}
                  height={300}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="px-2 text-center text-sm text-gray-500">
                  {qrErrorText || 'QR-код пока недоступен'}
                </div>
              )}
            </div>
            <MutedText as="p" className="text-gray-500">
              Если QR-код не загрузился, используйте ссылку.
            </MutedText>
          </div>
        </div>

        <div className="flex max-w-5xl flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                Мои рефералы
              </div>
              <MutedText as="p" className="mt-1 text-gray-500">
                Здесь отображаются пользователи, которые зарегистрировались по
                вашей реферальной ссылке.
              </MutedText>
            </div>
            {referralsData ? (
              <div className="flex flex-col items-start gap-2 text-sm text-gray-700 sm:items-end sm:text-right">
                <div>Рефералов: {referralsData.referralsCount ?? 0}</div>
                <div>
                  Начислено: {formatMoney(referralsData.rewardsTotal ?? 0)}
                </div>
                <Button
                  name="История начислений"
                  thin
                  className="px-3 text-xs"
                  onClick={() => router.push('/cabinet/billing-history')}
                />
              </div>
            ) : null}
          </div>

          {isReferralsLoading ? (
            <div className="flex min-h-24 items-center justify-center">
              <LoadingSpinner size="sm" text="Загрузка рефералов..." />
            </div>
          ) : referralsErrorText ? (
            <div className="text-danger text-sm">{referralsErrorText}</div>
          ) : referralsData?.referrals?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Пользователь</th>
                    <th className="py-2 pr-4 font-medium">Регистрация</th>
                    <th className="py-2 pr-4 font-medium">Начислений</th>
                    <th className="py-2 font-medium">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referralsData.referrals.map((row) => (
                    <tr key={row.user._id}>
                      <td className="py-3 pr-4 text-gray-900">
                        {getUserName(row.user)}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {formatDate(row.user.createdAt) || '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {row.rewardsCount ?? 0}
                      </td>
                      <td className="py-3 text-gray-900">
                        {formatMoney(row.rewardsTotal ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              Пока никто не зарегистрировался по вашей реферальной ссылке.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReferralsContent
