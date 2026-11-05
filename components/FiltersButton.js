import { forwardRef } from 'react'
import cn from 'classnames'
import FilterAltIcon from '@mui/icons-material/FilterAlt'

const FiltersButton = forwardRef(
  ({ active = false, count = 0, className, ...props }, ref) => (
    <button
      type="button"
      aria-label={active ? 'Фильтры, есть активные фильтры' : 'Фильтры'}
      {...props}
      ref={ref}
      className={cn(
        'filter-control min-h-10 min-w-[118px] shrink-0 gap-1 px-3 text-xs',
        active ? 'filter-control--primary' : 'filter-control--outline',
        className
      )}
    >
      <FilterAltIcon fontSize="small" />
      <span className="truncate">Фильтры{count > 0 ? ` (${count})` : ''}</span>
    </button>
  )
)

FiltersButton.displayName = 'FiltersButton'

export default FiltersButton
