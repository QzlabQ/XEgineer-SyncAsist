CREATE TYPE "ArticleRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

ALTER TABLE "Article" ADD COLUMN "teamId" TEXT;

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TeamRole" NOT NULL DEFAULT 'VIEWER',
  "invitedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArticleCollaborator" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ArticleRole" NOT NULL DEFAULT 'VIEWER',
  "invitedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArticleShareLink" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "role" "ArticleRole" NOT NULL DEFAULT 'VIEWER',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleShareLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborationSnapshot" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "ydocState" BYTEA,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE UNIQUE INDEX "ArticleCollaborator_articleId_userId_key" ON "ArticleCollaborator"("articleId", "userId");
CREATE UNIQUE INDEX "ArticleShareLink_tokenHash_key" ON "ArticleShareLink"("tokenHash");
CREATE UNIQUE INDEX "CollaborationSnapshot_articleId_key" ON "CollaborationSnapshot"("articleId");

CREATE INDEX "Article_teamId_idx" ON "Article"("teamId");
CREATE INDEX "Team_createdById_idx" ON "Team"("createdById");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE INDEX "TeamMember_invitedById_idx" ON "TeamMember"("invitedById");
CREATE INDEX "ArticleCollaborator_userId_idx" ON "ArticleCollaborator"("userId");
CREATE INDEX "ArticleCollaborator_invitedById_idx" ON "ArticleCollaborator"("invitedById");
CREATE INDEX "ArticleShareLink_articleId_idx" ON "ArticleShareLink"("articleId");
CREATE INDEX "ArticleShareLink_createdById_idx" ON "ArticleShareLink"("createdById");
CREATE INDEX "ArticleShareLink_expiresAt_idx" ON "ArticleShareLink"("expiresAt");
CREATE INDEX "CollaborationSnapshot_updatedById_idx" ON "CollaborationSnapshot"("updatedById");

ALTER TABLE "Article" ADD CONSTRAINT "Article_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ArticleCollaborator" ADD CONSTRAINT "ArticleCollaborator_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleCollaborator" ADD CONSTRAINT "ArticleCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleCollaborator" ADD CONSTRAINT "ArticleCollaborator_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ArticleShareLink" ADD CONSTRAINT "ArticleShareLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleShareLink" ADD CONSTRAINT "ArticleShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationSnapshot" ADD CONSTRAINT "CollaborationSnapshot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationSnapshot" ADD CONSTRAINT "CollaborationSnapshot_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
