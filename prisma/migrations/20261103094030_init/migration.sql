-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('OPEN', 'SCHEDULED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'LOGGED');

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATE,
    "projectId" INTEGER,
    "assigneeId" INTEGER,
    "completedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskUpdate" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "workerId" INTEGER,
    "oldStatus" "TaskStatus",
    "newStatus" "TaskStatus",
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRequest" (
    "id" SERIAL NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "link" TEXT,
    "estCost" DECIMAL(10,2),
    "notes" TEXT,
    "neededBy" DATE,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'PENDING',
    "managerNote" TEXT,
    "requesterId" INTEGER,
    "projectId" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRequest" (
    "id" SERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "notes" TEXT,
    "neededBy" DATE,
    "status" "MeetingStatus" NOT NULL DEFAULT 'OPEN',
    "withTeamId" INTEGER,
    "requesterId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "managerName" TEXT NOT NULL DEFAULT 'מנהל',
    "managerEmail" TEXT,
    "notifyManager" BOOLEAN NOT NULL DEFAULT true,
    "reportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reportDay" INTEGER NOT NULL DEFAULT 0,
    "reportHour" INTEGER NOT NULL DEFAULT 8,
    "scheduleUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReportAt" TIMESTAMP(3),
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastReminderDate" TEXT,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" SERIAL NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_token_key" ON "Worker"("token");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "TaskUpdate_taskId_idx" ON "TaskUpdate"("taskId");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRequest" ADD CONSTRAINT "MeetingRequest_withTeamId_fkey" FOREIGN KEY ("withTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRequest" ADD CONSTRAINT "MeetingRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
