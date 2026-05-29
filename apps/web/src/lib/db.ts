import Dexie, { type Table } from 'dexie'

export interface ArticleRecord {
  id?: number
  title: string
  tiptapJSON: string       // ProseMirror JSON serialized
  cover?: string
  summary?: string
  tags: string[]
  categories: string[]
  createdAt: number
  updatedAt: number
}

export interface PublishRecord {
  id?: number
  articleId: number
  platform: string
  platformName: string
  publishedAt: number
  url?: string
  postId?: string
  isDraft: boolean
  success: boolean
  error?: string
}

export interface PlatformConfigRecord {
  id?: number
  articleId: number
  platform: string
  config: string           // JSON serialized PlatformConfig
}

class XEgineerDB extends Dexie {
  articles!: Table<ArticleRecord>
  publishHistory!: Table<PublishRecord>
  platformConfigs!: Table<PlatformConfigRecord>

  constructor() {
    super('xegineer')
    this.version(1).stores({
      articles: '++id, title, updatedAt',
      publishHistory: '++id, articleId, platform, publishedAt',
      platformConfigs: '++id, [articleId+platform]',
    })
  }
}

export const db = new XEgineerDB()
