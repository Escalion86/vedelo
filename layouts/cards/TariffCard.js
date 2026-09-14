'use client'

import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import PropTypes from 'prop-types'
import CardButtons from '@components/CardButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import IconCheckBox from '@components/IconCheckBox'
import { useAtomValue } from 'jotai'
import CardWrapper from '@components/CardWrapper'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const formatPrice = (price) => {
  if (!price || Number(price) === 0) return 'Бесплатно'
  return `${Number(price).toLocaleString('ru-RU')} ₽/мес`
}

const formatEventsLimit = (limit, terms) => {
  if (!Number.isFinite(limit) || Number(limit) === 0) {
    return `Без ограничений по ${terms.pluralDative}`
  }
  return `До ${limit} ${terms.pluralGenitive} в месяц`
}

const TariffCard = ({ tariff, style, onEdit, onDelete }) => {
  const loading = useAtomValue(loadingAtom('tariff' + tariff?._id))
  const error = useAtomValue(errorAtom('tariff' + tariff?._id))
  const terms = useWorkItemTerminology()
  if (!tariff) return null

  return (
    <CardWrapper
      style={style}
      onClick={() => !loading && onEdit?.()}
      onSwipeLeft={() => !loading && onEdit?.()}
      onSwipeRight={() => !loading && onDelete?.()}
      className="card-body-pad group flex w-full cursor-pointer p-4 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} />
      <CardActions>
        <CardButtons
          item={tariff}
          compactTriggerClassName="card-menu-trigger h-10 min-h-10 w-10"
          typeOfItem="tariff"
          minimalActions
          alwaysCompact
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </CardActions>
      <div className="flex w-full flex-col gap-3 pr-12 sm:pr-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="card-title text-base">
              {tariff.title || 'Без названия'}
            </div>
            <div className="card-muted mt-1 text-sm">
              {formatEventsLimit(tariff.eventsPerMonth, terms)}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tariff.hidden && (
              <span className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                Скрытый
              </span>
            )}
            <div className="card-title text-lg font-semibold">
              {formatPrice(tariff.price)}
            </div>
          </div>
        </div>
        <div className="card-meta grid gap-2 text-sm sm:grid-cols-2">
          <IconCheckBox
            checked={tariff.allowCalendarSync}
            label="Синхронизация с календарем"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowStatistics}
            label="Просмотр статистики"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowDocuments}
            label="Работа с документами"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowTelephony}
            label="IP-телефония"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowAi}
            label="ИИ-возможности"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowAvitoIntegration}
            label="Интеграция Avito"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowVkIntegration}
            label="Интеграция VK"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowProposals ?? tariff.allowDocuments}
            label="Коммерческие предложения"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowTelegramIntegration}
            label="Интеграция Telegram"
            readOnly
            noMargin
          />
          <IconCheckBox
            checked={tariff.allowPublicLeadApi}
            label="Подключение сайта по API"
            readOnly
            noMargin
          />
        </div>
      </div>
    </CardWrapper>
  )
}

TariffCard.propTypes = {
  tariff: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string,
    eventsPerMonth: PropTypes.number,
    price: PropTypes.number,
    allowCalendarSync: PropTypes.bool,
    allowStatistics: PropTypes.bool,
    allowDocuments: PropTypes.bool,
    allowProposals: PropTypes.bool,
    allowTelephony: PropTypes.bool,
    allowAi: PropTypes.bool,
    allowAvitoIntegration: PropTypes.bool,
    allowVkIntegration: PropTypes.bool,
    allowTelegramIntegration: PropTypes.bool,
    allowPublicLeadApi: PropTypes.bool,
    hidden: PropTypes.bool,
  }).isRequired,
  style: PropTypes.shape({}),
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
}

TariffCard.defaultProps = {
  style: null,
}

export default TariffCard
