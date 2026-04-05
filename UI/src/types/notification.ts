export interface Notification {
  id: number
  name: string
  createdAt: string
  updatedAt: string
}

export interface NotificationPage {
  items: Notification[]
  total: number
  limit: number
  offset: number
}
