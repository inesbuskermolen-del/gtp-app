-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" SERIAL NOT NULL,
    "query" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverpassCache" (
    "id" SERIAL NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverpassCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_query_key" ON "GeocodeCache"("query");

-- CreateIndex
CREATE UNIQUE INDEX "OverpassCache_cacheKey_key" ON "OverpassCache"("cacheKey");

