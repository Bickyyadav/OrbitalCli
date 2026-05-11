import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db.js";
import { deviceAuthorization } from "better-auth/plugins";



export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "postgresql", ...etc
    }),
    basePath: "/api/auth",
    trustedOrigins: [
        process.env.CLIENT_URL
    ],
    plugins: [
        deviceAuthorization({
            verificationUri: process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/device` : "http://localhost:3000/device",
            schema: {},
        }),
    ],
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }
    }
})




