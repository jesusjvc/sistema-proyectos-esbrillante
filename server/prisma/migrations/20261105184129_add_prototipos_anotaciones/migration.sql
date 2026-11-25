-- CreateTable
CREATE TABLE "prototipos" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'prototipo',
    "estado" TEXT NOT NULL DEFAULT 'en_revision',
    "html" TEXT,
    "urlExterna" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "proyectoId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prototipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anotaciones" (
    "id" TEXT NOT NULL,
    "prototipoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "selector" TEXT NOT NULL,
    "pagina" TEXT NOT NULL DEFAULT '/',
    "posicion" JSONB NOT NULL,
    "contenido" JSONB NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anotaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prototipos_slug_key" ON "prototipos"("slug");

-- CreateIndex
CREATE INDEX "anotaciones_prototipoId_estado_idx" ON "anotaciones"("prototipoId", "estado");

-- AddForeignKey
ALTER TABLE "prototipos" ADD CONSTRAINT "prototipos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anotaciones" ADD CONSTRAINT "anotaciones_prototipoId_fkey" FOREIGN KEY ("prototipoId") REFERENCES "prototipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
