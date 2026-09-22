const getActivePushSubscriptionsFilter = (tenantId) => ({
  tenantId,
  isActive: true,
})

const getCurrentPushSubscriptionFilter = ({ tenantId, endpoint }) => ({
  tenantId,
  endpoint,
  isActive: true,
})

const getActiveExpoPushTokensFilter = (tenantId) => ({
  tenantId,
  isActive: true,
})

export {
  getActivePushSubscriptionsFilter,
  getActiveExpoPushTokensFilter,
  getCurrentPushSubscriptionFilter,
}
