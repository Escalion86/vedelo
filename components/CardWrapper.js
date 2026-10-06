import PropTypes from 'prop-types'
import cn from 'classnames'
import SwipeableCard from './SwipeableCard'

const CardWrapper = ({
  style,
  outerClassName,
  className,
  role = 'button',
  tabIndex = 0,
  onClick,
  onSwipeLeft,
  onSwipeRight,
  noHorizontalPadding = false,
  children,
}) => (
  <div
    style={style}
    className={cn(noHorizontalPadding ? '' : 'px-2', 'py-2', outerClassName)}
  >
    <SwipeableCard onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
      <div
        role={role}
        tabIndex={tabIndex}
        onClick={onClick}
        className={cn(
          'ui-surface-card ui-surface-card--interactive focus-visible:ring-general/60 relative h-full w-full overflow-hidden rounded-lg transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          className
        )}
      >
        {children}
      </div>
    </SwipeableCard>
  </div>
)

CardWrapper.propTypes = {
  style: PropTypes.shape({}),
  outerClassName: PropTypes.string,
  className: PropTypes.string,
  role: PropTypes.string,
  tabIndex: PropTypes.number,
  onClick: PropTypes.func,
  onSwipeLeft: PropTypes.func,
  onSwipeRight: PropTypes.func,
  children: PropTypes.node.isRequired,
}

CardWrapper.defaultProps = {
  style: null,
  outerClassName: '',
  className: '',
  role: 'button',
  tabIndex: 0,
  onClick: null,
  onSwipeLeft: null,
  onSwipeRight: null,
}

export default CardWrapper
