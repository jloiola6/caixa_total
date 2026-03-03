import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "altere-me";
  const existing = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });
  if (existing) {
    console.log("Super admin já existe, seed ignorado.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash,
      name: "Super Admin",
      role: "SUPER_ADMIN",
    },
  });
  console.log("Super admin criado:", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
