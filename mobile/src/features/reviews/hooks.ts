import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../shared/auth/AuthProvider'
import { getReviewStatuses, listReviews } from './api'
import type { ReviewFilters } from './types'
export const useReviews = (filters: ReviewFilters) => {
  const {user} = useAuth()
  return useQuery({queryKey:['nativeReviews',user?._id,user?.tenantId,filters],queryFn:({signal}) => listReviews(filters,signal),enabled:Boolean(user),networkMode:'always',placeholderData:undefined,refetchInterval:30000})
}
export const useRefreshReviews = () => {
  const cache = useQueryClient(), {user} = useAuth()
  return () => cache.invalidateQueries({queryKey:['nativeReviews',user?._id,user?.tenantId]})
}

export const useReviewStatuses = () => {
  const {user}=useAuth()
  return useQuery({queryKey:['nativeReviews',user?._id,user?.tenantId,'statuses'],queryFn:({signal})=>getReviewStatuses(signal),staleTime:30000,refetchOnMount:false,enabled:Boolean(user),networkMode:'always',placeholderData:undefined,refetchInterval:30000})
}
