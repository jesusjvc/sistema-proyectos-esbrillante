-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'EQUIPO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'EQUIPO',
    "esKarla" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyectos" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente_anticipo',
    "tipo" TEXT NOT NULL DEFAULT 'finito',
    "cliente" JSONB NOT NULL,
    "proyecto" JSONB NOT NULL,
    "condicionesTecnicas" JSONB NOT NULL,
    "equipo" JSONB NOT NULL,
    "linksCliente" JSONB NOT NULL DEFAULT '{}',
    "driveRespuestasId" TEXT,
    "vistoAdminEn" TIMESTAMP(3),
    "tiempos" JSONB NOT NULL DEFAULT '{}',
    "passwordCliente" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
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
    "custom" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "completadaPor" TEXT,
    "completadaEn" TIMESTAMP(3),
    "asignadoA" TEXT,
    "respuestaTexto" TEXT,
    "respuestaArchivoUrl" TEXT,
    "respuestaArchivoNombre" TEXT,

    CONSTRAINT "tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUris" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_entries" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_slug_key" ON "proyectos"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
