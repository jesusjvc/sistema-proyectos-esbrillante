-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "driveRecursosId" TEXT;

-- AlterTable
ALTER TABLE "tareas" ADD COLUMN     "modulo" TEXT;

-- CreateTable
CREATE TABLE "notas_proyecto" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorId" TEXT,
    "texto" TEXT NOT NULL,
    "mencionados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_proyecto_proyectoId_creadoEn_idx" ON "notas_proyecto"("proyectoId", "creadoEn");

-- AddForeignKey
ALTER TABLE "notas_proyecto" ADD CONSTRAINT "notas_proyecto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
