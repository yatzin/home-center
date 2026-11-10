import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { ENTITY_MODELS, entitiesChanged, WRITE_OPERATIONS } from "@/lib/search/entities/changes"

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  // Waits for a lock instead of failing with SQLITE_BUSY when the schedulers and a
  // request write at the same moment. Applies to every connection, transactions too.
  const adapter = new PrismaLibSql({ url, timeout: 5000 })
  // Any write to a record global search embeds schedules a re-sync of that
  // index (lib/search/entities), so no server action has to remember to.
  return new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args)
          if (WRITE_OPERATIONS.has(operation) && ENTITY_MODELS.has(model)) entitiesChanged()
          return result
        },
      },
    },
  })
}

type Client = ReturnType<typeof createClient>

const globalForPrisma = globalThis as unknown as { prisma: Client }

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
