import PropTypes from 'prop-types'
import LoadingSpinner from '@components/LoadingSpinner'

const CardOverlay = ({ loading, error, rounded = false }) => {
  if (!loading && !error) return null
  const roundedClass = rounded ? 'rounded-xl' : ''
  if (error) {
    return (
      <div
        className={`bg-opacity-80 absolute inset-0 z-20 flex items-center justify-center bg-red-800 text-2xl text-white ${roundedClass}`}
      >
        ОШИБКА
      </div>
    )
  }
  return (
    <div
      className={`card-loading-overlay bg-general bg-opacity-80 absolute inset-0 z-20 flex items-center justify-center ${roundedClass}`}
    >
      <LoadingSpinner />
    </div>
  )
}

CardOverlay.propTypes = {
  loading: PropTypes.bool,
  error: PropTypes.bool,
  rounded: PropTypes.bool,
}

CardOverlay.defaultProps = {
  loading: false,
  error: false,
  rounded: false,
}

export default CardOverlay
