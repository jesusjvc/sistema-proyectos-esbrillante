-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[];
