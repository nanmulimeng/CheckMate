-- CreateIndex
CREATE INDEX "Comment_checkInId_idx" ON "Comment"("checkInId");

-- CreateIndex
CREATE INDEX "Photo_checkInId_idx" ON "Photo"("checkInId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_userId_name_key" ON "Subject"("userId", "name");

