-- 每周一句话：WeeklyNote(userId, weekStart) 唯一，一周一条后写覆盖
-- CreateTable
CREATE TABLE "WeeklyNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "weekStart" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyNote_userId_weekStart_key" ON "WeeklyNote"("userId", "weekStart");
