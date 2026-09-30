-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailsAlternos" TEXT[] DEFAULT ARRAY[]::TEXT[];
