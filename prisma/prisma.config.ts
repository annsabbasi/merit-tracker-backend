// import path from 'node:path';
// import type { PrismaConfig } from 'prisma';

// // Load environment variables
// import 'dotenv/config';

// export default {
//     earlyAccess: true,
//     schema: path.join(__dirname, 'schema.prisma'),

//     migrate: {
//         async development() {
//             // Use direct connection for migrations (bypasses PgBouncer)
//             return {
//                 url: process.env.DIRECT_URL!,
//             };
//         },
//         async production() {
//             // Use direct connection for migrations in production too
//             return {
//                 url: process.env.DIRECT_URL!,
//             };
//         },
//     },
// } satisfies PrismaConfig;