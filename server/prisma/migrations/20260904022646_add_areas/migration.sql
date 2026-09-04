-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "areas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "area" TEXT;
