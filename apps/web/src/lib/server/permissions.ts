import { ArticleRole, TeamRole, type Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type ArticleAccessRole = ArticleRole
export type TeamAccessRole = TeamRole

const articleRoleRank: Record<ArticleRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
}

const teamRoleRank: Record<TeamRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
}

export function canViewArticle(role: ArticleRole | null | undefined): boolean {
  return Boolean(role)
}

export function canEditArticle(role: ArticleRole | null | undefined): boolean {
  return hasArticleRole(role, 'EDITOR')
}

export function canManageArticle(role: ArticleRole | null | undefined): boolean {
  return role === 'OWNER'
}

export function canManageTeam(role: TeamRole | null | undefined): boolean {
  return role === 'OWNER'
}

export function hasArticleRole(role: ArticleRole | null | undefined, minimum: ArticleRole): boolean {
  if (!role) return false
  return articleRoleRank[role] >= articleRoleRank[minimum]
}

export function hasTeamRole(role: TeamRole | null | undefined, minimum: TeamRole): boolean {
  if (!role) return false
  return teamRoleRank[role] >= teamRoleRank[minimum]
}

export function getAccessibleArticleWhere(userId: string): Prisma.ArticleWhereInput {
  return {
    OR: [
      { userId },
      { collaborators: { some: { userId } } },
      { team: { members: { some: { userId } } } },
    ],
  }
}

export function articleAccessInclude(userId: string) {
  return {
    user: { select: { id: true, email: true, name: true } },
    collaborators: {
      where: { userId },
      select: { userId: true, role: true },
    },
    team: {
      select: {
        id: true,
        name: true,
        members: {
          where: { userId },
          select: { userId: true, role: true },
        },
      },
    },
  } satisfies Prisma.ArticleInclude
}

type ArticleWithAccess = Prisma.ArticleGetPayload<{
  include: ReturnType<typeof articleAccessInclude>
}>

export async function getArticleAccess(userId: string, articleId: string): Promise<{ article: ArticleWithAccess; role: ArticleRole } | null> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: articleAccessInclude(userId),
  })
  if (!article) return null

  const role = resolveArticleRole(article, userId)
  if (!role) return null
  return { article, role }
}

export async function requireArticleRole(userId: string, articleId: string, minimum: ArticleRole): Promise<{ article: ArticleWithAccess; role: ArticleRole } | null> {
  const access = await getArticleAccess(userId, articleId)
  if (!access || !hasArticleRole(access.role, minimum)) return null
  return access
}

export function resolveArticleRole(article: ArticleWithAccess, userId: string): ArticleRole | null {
  const roles: ArticleRole[] = []

  if (article.userId === userId) roles.push('OWNER')
  for (const collaborator of article.collaborators ?? []) {
    roles.push(collaborator.role)
  }
  for (const member of article.team?.members ?? []) {
    roles.push(teamRoleToArticleRole(member.role))
  }

  return highestArticleRole(roles)
}

export async function getTeamRole(userId: string, teamId: string): Promise<TeamRole | null> {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  })
  return member?.role ?? null
}

export function normalizeArticleRole(value: unknown, fallback: ArticleRole = 'VIEWER'): ArticleRole {
  return value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER' ? value : fallback
}

export function normalizeTeamRole(value: unknown, fallback: TeamRole = 'VIEWER'): TeamRole {
  return value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER' ? value : fallback
}

export function highestArticleRole(roles: Array<ArticleRole | null | undefined>): ArticleRole | null {
  let best: ArticleRole | null = null
  for (const role of roles) {
    if (!role) continue
    if (!best || articleRoleRank[role] > articleRoleRank[best]) best = role
  }
  return best
}

function teamRoleToArticleRole(role: TeamRole): ArticleRole {
  if (role === 'OWNER') return 'OWNER'
  if (role === 'EDITOR') return 'EDITOR'
  return 'VIEWER'
}
