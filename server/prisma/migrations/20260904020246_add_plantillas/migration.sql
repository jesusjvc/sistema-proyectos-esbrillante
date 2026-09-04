-- CreateTable
CREATE TABLE "plantillas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'General',
    "descripcion" TEXT NOT NULL DEFAULT '',
    "fases" JSONB NOT NULL DEFAULT '[]',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas_plantilla" (
    "id" TEXT NOT NULL,
    "plantillaId" TEXT NOT NULL,
    "fase" INTEGER NOT NULL,
    "orden" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "responsable" TEXT NOT NULL DEFAULT 'equipo',
    "dependencias" TEXT[],
    "condicion" TEXT,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "queHacer" TEXT NOT NULL DEFAULT '',
    "necesitasAntes" TEXT NOT NULL DEFAULT '',
    "plantillaMensaje" TEXT NOT NULL DEFAULT '',
    "queEntregas" TEXT NOT NULL DEFAULT '',
    "linkTipo" TEXT,
    "esCliente" BOOLEAN NOT NULL DEFAULT false,
    "instruccionesCliente" TEXT NOT NULL DEFAULT '',
    "plazoHoras" INTEGER,
    "esRutaCritica" BOOLEAN NOT NULL DEFAULT false,
    "soloAdmin" BOOLEAN NOT NULL DEFAULT false,
    "soloKarlaOAdmin" BOOLEAN NOT NULL DEFAULT false,
    "opcional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tareas_plantilla_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tareas_plantilla" ADD CONSTRAINT "tareas_plantilla_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "plantillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
