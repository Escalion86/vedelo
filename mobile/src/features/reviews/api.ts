import { api } from '../../shared/api/client'
import { uploadOnce } from '../profile/uploadOnce'
import { publicAppearance, reviewQuery, validateLogo } from './domain'
import type { ClientReview, ReviewAction, ReviewAppearance, ReviewFilters, ReviewList, ReviewPageData, ReviewResult, ReviewStatus } from './types'
type Response<T> = { success: boolean; data: T }
const data = <T>(response: Response<T>) => { if (!response.success || !response.data) throw new Error('Сервер не подтвердил результат'); return response.data }
export const listReviews = async (filters: ReviewFilters, signal?: AbortSignal) => data(await api.get<Response<ReviewList>>(`/client-reviews?${reviewQuery(filters)}`,{signal}))
export const createReview = async (eventId: string, confirmedCompleted: boolean) => data(await api.post<Response<ReviewResult>>('/client-reviews',{eventId,confirmedCompleted}))
export const actOnReview = async (id: string, action: ReviewAction, note?: string) => data(await api.patch<Response<ReviewResult>>(`/client-reviews/${id}`, {action,...(action === 'note' ? {note} : {})}))
export const readExactReview = async (review: ClientReview) => {
  const result = await listReviews({eventId:review.eventId,page:0})
  const exact = result.items.find((row) => row._id === review._id)
  if (!exact) throw new Error('Не удалось перечитать сохранённый отзыв')
  return exact
}
export const getReviewPage = async (signal?: AbortSignal) => data(await api.get<Response<ReviewPageData>>('/site/review-page',{signal}))
export const saveReviewPage = async (appearance: ReviewAppearance) => {
  data(await api.post<Response<ReviewPageData>>('/site/review-page',publicAppearance(appearance)))
  return getReviewPage()
}
export const uploadReviewLogo = async (asset: {uri: string; name: string; mimeType: string; size: number}, webFile?: Blob) => {
  const error = validateLogo(asset); if (error) throw new Error(error)
  const form = new FormData()
  if (webFile) form.append('file',webFile,asset.name)
  else form.append('file',{uri:asset.uri,name:asset.name,type:asset.mimeType} as unknown as Blob)
  const result = data(await uploadOnce<Response<{url:string}>>('/site/review-page/logo',form))
  if (!result.url) throw new Error('Сервер не вернул изображение')
  return result.url
}

export const getReviewStatuses = async (signal?:AbortSignal) => data(await api.get<Response<Record<string,{status:ReviewStatus;rating?:number|null}>>>('/client-reviews/statuses',{signal}))
