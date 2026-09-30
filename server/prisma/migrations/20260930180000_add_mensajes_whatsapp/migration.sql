-- CreateTable
CREATE TABLE "mensajes_whatsapp" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fechaMensaje" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensajes_whatsapp_proyectoId_fechaMensaje_idx" ON "mensajes_whatsapp"("proyectoId", "fechaMensaje");

-- AddForeignKey
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
