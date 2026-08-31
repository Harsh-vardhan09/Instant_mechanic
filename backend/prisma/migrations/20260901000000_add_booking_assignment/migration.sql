-- CreateTable
CREATE TABLE "booking_assignments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "mechanicId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_assignments_mechanicId_idx" ON "booking_assignments"("mechanicId");

-- CreateIndex
-- This is the whole idempotence guarantee: one row per (booking, mechanic), enforced by
-- Postgres. A second dispatch of the same mechanic raises 23505 instead of racing.
CREATE UNIQUE INDEX "booking_assignments_bookingId_mechanicId_key" ON "booking_assignments"("bookingId", "mechanicId");

-- AddForeignKey
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "mechanics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
