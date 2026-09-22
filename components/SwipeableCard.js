'use client'

import { faPencilAlt, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { motion } from 'framer-motion'
import PropTypes from 'prop-types'
import { useRef } from 'react'

const SWIPE_LIMIT = 112
const SWIPE_TRIGGER_DISTANCE = 64
const SWIPE_TRIGGER_VELOCITY = 450

const SwipeableCard = ({ children, onSwipeLeft, onSwipeRight, className }) => {
  const suppressClick = useRef(false)
  const swipeEnabled = Boolean(onSwipeLeft || onSwipeRight)

  const handlePointerDownCapture = () => {
    suppressClick.current = false
  }

  const handleDragStart = () => {
    suppressClick.current = true
  }

  const handleDragEnd = (_, info) => {
    const distance = info.offset.x
    const velocity = info.velocity.x
    const swipedLeft =
      Boolean(onSwipeLeft) &&
      (distance <= -SWIPE_TRIGGER_DISTANCE ||
        velocity <= -SWIPE_TRIGGER_VELOCITY)
    const swipedRight =
      Boolean(onSwipeRight) &&
      (distance >= SWIPE_TRIGGER_DISTANCE || velocity >= SWIPE_TRIGGER_VELOCITY)

    const swipeAction = swipedLeft
      ? onSwipeLeft
      : swipedRight
        ? onSwipeRight
        : null
    if (swipeAction) {
      setTimeout(swipeAction, 0)
    }
  }

  const handleClickCapture = (event) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent?.stopImmediatePropagation?.()
  }

  if (!swipeEnabled) return children

  return (
    <div className={`card-swipe-row ${className || ''}`}>
      {onSwipeRight ? (
        <div
          className="card-swipe-action card-swipe-action--delete"
          aria-hidden="true"
        >
          <FontAwesomeIcon icon={faTrashAlt} />
          <span>Удалить</span>
        </div>
      ) : null}
      {onSwipeLeft ? (
        <div
          className="card-swipe-action card-swipe-action--edit"
          aria-hidden="true"
        >
          <FontAwesomeIcon icon={faPencilAlt} />
          <span>Изменить</span>
        </div>
      ) : null}
      <motion.div
        className="card-swipe-content"
        drag="x"
        dragConstraints={{
          left: onSwipeLeft ? -SWIPE_LIMIT : 0,
          right: onSwipeRight ? SWIPE_LIMIT : 0,
        }}
        dragDirectionLock
        dragElastic={0.08}
        dragMomentum={false}
        dragSnapToOrigin="x"
        dragTransition={{ bounceStiffness: 520, bounceDamping: 38 }}
        onPointerDownCapture={handlePointerDownCapture}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClickCapture={handleClickCapture}
        style={{ touchAction: 'pan-y' }}
      >
        {children}
      </motion.div>
    </div>
  )
}

SwipeableCard.propTypes = {
  children: PropTypes.node.isRequired,
  onSwipeLeft: PropTypes.func,
  onSwipeRight: PropTypes.func,
  className: PropTypes.string,
}

SwipeableCard.defaultProps = {
  onSwipeLeft: null,
  onSwipeRight: null,
  className: '',
}

export default SwipeableCard
