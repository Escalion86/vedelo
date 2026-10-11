export const initialWorkItemStatus = (value: unknown): 'draft' | 'active' =>
  value === 'active' ? 'active' : 'draft'

export const initialWorkItemMode = (value: unknown): 'manual' | 'voice' | 'text' | 'photo' =>
  value === 'voice' || value === 'text' || value === 'photo' ? value : 'manual'

export type CreateWorkItemChoice = 'draft' | 'active' | 'voice' | 'text' | 'photo'
export const createWorkItemRoute = (choice: CreateWorkItemChoice) => ({
  pathname: '/events/edit/new' as const,
  params: { initialStatus: choice === 'active' ? 'active' : 'draft',
    mode: choice === 'voice' || choice === 'text' || choice === 'photo' ? choice : 'manual' },
})
