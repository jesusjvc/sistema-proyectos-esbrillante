-- AlterTable
ALTER TABLE "tareas" ADD COLUMN     "avisosDesactivados" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "disponibleDesde" TIMESTAMP(3),
ADD COLUMN     "ultimoRecordatorioEn" TIMESTAMP(3);

