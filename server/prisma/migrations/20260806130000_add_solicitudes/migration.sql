-- CreateTable
CREATE TABLE "solicitudes" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "motivoRechazo" TEXT,
    "resueltaPor" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "tareaId" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
