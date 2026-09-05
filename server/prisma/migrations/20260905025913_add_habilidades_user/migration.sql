-- AlterTable
ALTER TABLE "users" ADD COLUMN     "habilidades" TEXT[] DEFAULT ARRAY[]::TEXT[];
