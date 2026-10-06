import { useState } from 'react'
import PropTypes from 'prop-types'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import CheckBox from '@components/CheckBox'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import InputWrapper from '@components/InputWrapper'
import { useAtomValue } from 'jotai'
import servicesAtom from '@state/atoms/servicesAtom'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'
import cn from 'classnames'

const ChevronIcon = ({ open }) => (
  <svg
    className={cn(
      'h-4 w-4 text-gray-400 transition-transform',
      open && 'rotate-90'
    )}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5l7 7-7 7"
    />
  </svg>
)

const ServiceMultiSelect = ({
  value,
  onChange,
  services: propServices,
  atom,
  onCreate,
  onEdit,
  error,
  required,
  onClearError,
}) => {
  // Determine data source: prefer prop services, otherwise use atom
  const atomToUse = atom || servicesAtom
  const atomServices = useAtomValue(atomToUse)
  const allServices =
    (Array.isArray(propServices) && propServices.length
      ? propServices
      : atomServices) || []
  const serviceGroups = useAtomValue(serviceGroupsAtom)
  const selectedIds = Array.isArray(value) ? value : []
  const [expandedGroups, setExpandedGroups] = useState({})

  const toggleService = (serviceId) => {
    if (onClearError) onClearError()
    const isSelected = selectedIds.includes(serviceId)
    onChange(
      isSelected
        ? selectedIds.filter((id) => id !== serviceId)
        : [...selectedIds, serviceId]
    )
  }

  const toggleGroup = (groupId, currentExpanded) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !currentExpanded }))
  }

  // Groups are collapsed by default and expanded only when they contain
  // at least one selected service (unless the user toggled them manually)
  const isGroupExpanded = (groupId, hasSelected) =>
    expandedGroups[groupId] ?? hasSelected

  // Group services
  const grouped = {}
  const withoutGroup = []

  allServices.forEach((service) => {
    if (service?.groupId) {
      const gId = service.groupId
      if (!grouped[gId]) grouped[gId] = []
      grouped[gId].push(service)
    } else {
      withoutGroup.push(service)
    }
  })

  // Sort groups by order
  const sortedGroups = [...serviceGroups].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )

  // Filter out groups that have no services
  const groupsWithServices = sortedGroups.filter((g) => {
    const servicesInGroup = grouped[g._id]
    return Array.isArray(servicesInGroup) && servicesInGroup.length > 0
  })

  // Sort services within each group by title
  Object.keys(grouped).forEach((gId) => {
    grouped[gId].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', 'ru')
    )
  })

  // Sort services without group
  const sortedWithoutGroup = [...withoutGroup].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', 'ru')
  )

  const hasServices =
    allServices.length > 0 ||
    groupsWithServices.length > 0 ||
    sortedWithoutGroup.length > 0

  // If there is only one section total (one group or only «Без группы»),
  // grouping headers and collapsing are pointless — render a flat list
  const sectionsCount =
    groupsWithServices.length + (sortedWithoutGroup.length > 0 ? 1 : 0)
  const isFlatList = sectionsCount <= 1
  const flatServices = isFlatList
    ? [...allServices].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', 'ru')
      )
    : []

  const renderServiceRow = (service) => (
    <div key={service._id} className="flex items-center gap-x-1">
      <CheckBox
        checked={selectedIds.includes(service._id)}
        label={`${service.title}${service.price ? ` — ${service.price} ₽` : ''}`}
        noMargin
        wrapperClassName="min-w-0 flex-1"
        onClick={() => toggleService(service._id)}
      />
      {onEdit && (
        <IconActionButton
          icon={faPencilAlt}
          onClick={() => onEdit(service._id)}
          title={`Редактировать услугу «${service.title}»`}
          size="xs"
          variant="neutral"
        />
      )}
    </div>
  )

  return (
    <InputWrapper label="Услуги" required={required} error={error}>
      <div className="flex w-full gap-x-1">
        <div className={cn('flex flex-1 flex-col gap-1')}>
          {!hasServices ? (
            <div className="text-sm text-gray-500">Услуги не добавлены</div>
          ) : isFlatList ? (
            <div className="flex flex-col gap-1">
              {flatServices.map((service) => renderServiceRow(service))}
            </div>
          ) : (
            <>
              {/* Services without group */}
              {sortedWithoutGroup.length > 0 &&
                (() => {
                  const withoutGroupExpanded = isGroupExpanded(
                    '__without_group',
                    sortedWithoutGroup.some((s) => selectedIds.includes(s._id))
                  )
                  return (
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          toggleGroup('__without_group', withoutGroupExpanded)
                        }
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold transition',
                          'text-gray-500 hover:bg-gray-100'
                        )}
                      >
                        <ChevronIcon open={withoutGroupExpanded} />
                        <span>Без группы</span>
                        <span className="text-xs font-normal text-gray-400">
                          {(() => {
                            const selected = sortedWithoutGroup.filter((s) =>
                              selectedIds.includes(s._id)
                            ).length
                            return selected > 0
                              ? `(Выбрано ${selected}/${sortedWithoutGroup.length})`
                              : `(${sortedWithoutGroup.length})`
                          })()}
                        </span>
                      </button>
                      {withoutGroupExpanded && (
                        <div className="flex flex-col gap-1 pl-5">
                          {sortedWithoutGroup.map((service) =>
                            renderServiceRow(service)
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

              {/* Groups with services */}
              {groupsWithServices.map((group) => {
                const servicesInGroup = grouped[group._id] || []
                const isExpanded = isGroupExpanded(
                  group._id,
                  servicesInGroup.some((s) => selectedIds.includes(s._id))
                )

                return (
                  <div key={group._id} className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group._id, isExpanded)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold transition',
                        'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      <ChevronIcon open={isExpanded} />
                      <span>{group.title}</span>
                      <span className="text-xs font-normal text-gray-400">
                        {(() => {
                          const selected = servicesInGroup.filter((s) =>
                            selectedIds.includes(s._id)
                          ).length
                          return selected > 0
                            ? `(Выбрано ${selected}/${servicesInGroup.length})`
                            : `(${servicesInGroup.length})`
                        })()}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="flex flex-col gap-1 pl-5">
                        {servicesInGroup.map((service) =>
                          renderServiceRow(service)
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
        {onCreate && (
          <div className="flex min-h-full flex-col">
            <AddIconButton
              onClick={onCreate}
              title="Добавить услугу"
              size="sm"
            />
          </div>
        )}
      </div>
    </InputWrapper>
  )
}

ServiceMultiSelect.propTypes = {
  value: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  ),
  onChange: PropTypes.func.isRequired,
  services: PropTypes.array,
  atom: PropTypes.object,
  onCreate: PropTypes.func,
  onEdit: PropTypes.func,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  required: PropTypes.bool,
  onClearError: PropTypes.func,
}

ServiceMultiSelect.defaultProps = {
  value: [],
  services: null,
  atom: null,
  onCreate: null,
  onEdit: null,
  error: null,
  required: false,
  onClearError: null,
}

export default ServiceMultiSelect
