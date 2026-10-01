import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { ENTITY_MODELS, entitiesChanged, WRITE_OPERATIONS } from "@/lib/search/entities/changes"

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const adapter = new PrismaLibSql({ url })
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
