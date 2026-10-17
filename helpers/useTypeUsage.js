import { useQuery } from '@tanstack/react-query'

export default function useTypeUsage() {
  return useQuery({ queryKey: ['type-usage'], staleTime: 0, queryFn: async () => {
    const response = await fetch('/api/type-usage')
    if (!response.ok) throw new Error('Не удалось загрузить число использований')
    return response.json()
  } })
}
