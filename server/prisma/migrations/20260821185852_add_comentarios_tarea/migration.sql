-- CreateTable
CREATE TABLE "comentarios_tarea" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "mencionados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_tarea_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "comentarios_tarea" ADD CONSTRAINT "comentarios_tarea_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
