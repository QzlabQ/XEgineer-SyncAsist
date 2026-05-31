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
  message?: string
}

export interface PlatformConfigRecord {
  id?: number
  articleId: number
  platform: string
  config: string           // JSON serialized PlatformConfig
}

export interface ScheduledPublishRecord {
  id?: number
  jobId: string
  articleId: number
  articleTitle: string
  platforms: string[]      // platform ids
  platformNames: string[]
  scheduledAt: number
  createdAt: number
  status: 'scheduled' | 'draft_ready' | 'running' | 'publishing' | 'success' | 'error' | 'cancelled'
  results?: string           // JSON serialized scheduled publish results
  error?: string
}

class XEgineerDB extends Dexie {
  articles!: Table<ArticleRecord>
  publishHistory!: Table<PublishRecord>
  platformConfigs!: Table<PlatformConfigRecord>
  scheduledPublishes!: Table<ScheduledPublishRecord>

  constructor() {
    super('xegineer')
    this.version(1).stores({
      articles: '++id, title, updatedAt',
      publishHistory: '++id, articleId, platform, publishedAt',
      platformConfigs: '++id, [articleId+platform]',
    })
    this.version(2).stores({
      articles: '++id, title, updatedAt',
      publishHistory: '++id, articleId, platform, publishedAt',
      platformConfigs: '++id, [articleId+platform]',
      scheduledPublishes: '++id, jobId, articleId, scheduledAt, status, createdAt',
    })
  }
}

export const db = new XEgineerDB()
