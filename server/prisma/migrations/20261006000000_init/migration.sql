-- CreateEnum
CREATE TYPE "RoomVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'ACTIVE', 'FINISHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ACTIVE', 'FINISHED', 'ABORTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "username" VARCHAR(18) NOT NULL,
    "avatar" VARCHAR(16) NOT NULL DEFAULT '🦊',
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "correctGuesses" INTEGER NOT NULL DEFAULT 0,
    "fastestGuessMs" INTEGER,
    "drawingsCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "code" VARCHAR(5) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "hostUserId" UUID,
    "visibility" "RoomVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "settings" JSONB NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "currentPlayers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "roomCode" VARCHAR(5) NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "rounds" INTEGER NOT NULL,
    "winnerId" UUID,
    "settings" JSONB NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "userId" UUID,
    "playerId" UUID NOT NULL,
    "username" VARCHAR(18) NOT NULL,
    "avatar" VARCHAR(16) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "correctGuesses" INTEGER NOT NULL DEFAULT 0,
    "roundsWon" INTEGER NOT NULL DEFAULT 0,
    "fastestGuessMs" INTEGER,
    "drawingsCompleted" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "drawerUserId" UUID,
    "drawerName" VARCHAR(18) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "selectedWordHash" CHAR(64),
    "scoresAwarded" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guess" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "userId" UUID,
    "playerId" UUID NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "guessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingSummary" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "userId" UUID,
    "strokeCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionHash_key" ON "Session"("sessionHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Profile_totalScore_idx" ON "Profile"("totalScore" DESC);

-- CreateIndex
CREATE INDEX "Profile_gamesWon_idx" ON "Profile"("gamesWon" DESC);

-- CreateIndex
CREATE INDEX "Profile_correctGuesses_idx" ON "Profile"("correctGuesses" DESC);

-- CreateIndex
CREATE INDEX "Profile_username_idx" ON "Profile"("username");

-- CreateIndex
CREATE INDEX "Room_status_idx" ON "Room"("status");

-- CreateIndex
CREATE INDEX "Room_visibility_status_expiresAt_idx" ON "Room"("visibility", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Room_hostUserId_idx" ON "Room"("hostUserId");

-- CreateIndex
CREATE INDEX "Game_roomCode_startedAt_idx" ON "Game"("roomCode", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "Game_status_endedAt_idx" ON "Game"("status", "endedAt");

-- CreateIndex
CREATE INDEX "Game_winnerId_idx" ON "Game"("winnerId");

-- CreateIndex
CREATE INDEX "GamePlayer_userId_gameId_idx" ON "GamePlayer"("userId", "gameId");

-- CreateIndex
CREATE INDEX "GamePlayer_gameId_finalScore_idx" ON "GamePlayer"("gameId", "finalScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_playerId_key" ON "GamePlayer"("gameId", "playerId");

-- CreateIndex
CREATE INDEX "Round_drawerUserId_idx" ON "Round"("drawerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_gameId_roundNumber_key" ON "Round"("gameId", "roundNumber");

-- CreateIndex
CREATE INDEX "Guess_userId_correct_guessedAt_idx" ON "Guess"("userId", "correct", "guessedAt");

-- CreateIndex
CREATE INDEX "Guess_gameId_roundId_idx" ON "Guess"("gameId", "roundId");

-- CreateIndex
CREATE INDEX "DrawingSummary_userId_idx" ON "DrawingSummary"("userId");

-- CreateIndex
CREATE INDEX "DrawingSummary_gameId_roundId_idx" ON "DrawingSummary"("gameId", "roundId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guess" ADD CONSTRAINT "Guess_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guess" ADD CONSTRAINT "Guess_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guess" ADD CONSTRAINT "Guess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSummary" ADD CONSTRAINT "DrawingSummary_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSummary" ADD CONSTRAINT "DrawingSummary_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
