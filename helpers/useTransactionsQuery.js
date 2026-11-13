'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import { apiJson } from '@helpers/apiClient'
import { reachGoal } from '@helpers/metrikaGoals'
import { queryKeys } from '@helpers/queryKeys'
import transactionsAtom from '@state/atoms/transactionsAtom'

const fetchTransactions = async () => {
  const payload = await apiJson('/api/transactions')
  if (!Array.isArray(payload?.data)) throw new Error('Invalid transactions response')
  return payload.data
}

export const useTransactionsQuery = (initialData, options = {}) =>
  useQuery({
    queryKey: queryKeys.transactionsAll,
    queryFn: fetchTransactions,
    initialData,
    ...options,
  })

const upsertTransaction = (items, transaction) => {
  if (!Array.isArray(items)) return transaction?._id ? [transaction] : []
  if (!transaction?._id) return items
  const exists = items.some((item) => item?._id === transaction._id)
  if (!exists) return [...items, transaction]
  return items.map((item) => (item?._id === transaction._id ? transaction : item))
}

const updateCachedTransactions = (queryClient, update) => {
  queryClient.setQueryData(queryKeys.transactionsAll, update)
  queryClient.setQueryData(queryKeys.transactionsList, (items) =>
    items === undefined ? undefined : update(items)
  )
}

export const useCreateTransactionMutation = () => {
  const queryClient = useQueryClient()
  const setTransactions = useSetAtom(transactionsAtom)

  return useMutation({
    mutationFn: async (payload) =>
      apiJson('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (payload) => {
      const transaction = payload?.data
      if (!transaction?._id) return
      updateCachedTransactions(queryClient, (prev = []) =>
        upsertTransaction(prev, transaction)
      )
      setTransactions((prev) => upsertTransaction(prev, transaction))
      reachGoal('transaction_created', {
        transactionId: transaction._id,
        type: transaction.type,
        category: transaction.category,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export const useUpdateTransactionMutation = () => {
  const queryClient = useQueryClient()
  const setTransactions = useSetAtom(transactionsAtom)

  return useMutation({
    mutationFn: async ({ transactionId, payload }) =>
      apiJson(`/api/transactions/${transactionId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: (payload) => {
      const transaction = payload?.data
      if (!transaction?._id) return
      updateCachedTransactions(queryClient, (prev = []) =>
        upsertTransaction(prev, transaction)
      )
      setTransactions((prev) => upsertTransaction(prev, transaction))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export const useDeleteTransactionMutation = () => {
  const queryClient = useQueryClient()
  const setTransactions = useSetAtom(transactionsAtom)

  return useMutation({
    mutationFn: async (transactionId) =>
      apiJson(`/api/transactions/${transactionId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      }),
    onSuccess: (data, transactionId) => {
      const removeTransaction = (prev = []) =>
        Array.isArray(prev)
          ? prev.filter((item) => item?._id !== transactionId)
          : prev
      updateCachedTransactions(queryClient, removeTransaction)
      setTransactions(removeTransaction)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
