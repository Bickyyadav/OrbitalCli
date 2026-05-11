import { cancel, confirm, intro, isCancel, outro, spinner } from "@clack/prompts"
import { logger } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import chalk from "chalk";
import { Command } from "commander";
import fs from "node:fs/promises"
import open from "open"
import os from "os"
import path from "path"
import yoctoSpinner from "yocto-spinner";
import * as z from "zod/v4"
import dotenv from "dotenv"
import prisma from "../../../lib/db.js"

dotenv.config()

const URL = process.env.BETTER_AUTH_URL || "http://localhost:3001";
const CLIENT_ID = process.env.GITHUB_CLIENT_ID
const COFIG_DIR = path.join(os.homedir(), ".better-auth")
const TOKEN_FILE = path.join(COFIG_DIR, "token.json")


export async function loginAction(opts) {
    const options = z.object({
        serverUrl: z.string().default(URL).optional(),
        clientId: z.string().default(CLIENT_ID).optional(),
    })

    const serverUrl = opts.serverUrl || process.env.BETTER_AUTH_URL || "http://localhost:3001";
    const clientId = opts.clientId || process.env.GITHUB_CLIENT_ID;

    if (!serverUrl || !clientId) {
        throw new Error("Server URL and Client ID are required");
    }
    intro(chalk.bold("Welcome to Orbit CLI"))

    const existingToken = false;
    const expired = false;

    if (existingToken && !expired) {
        const shouldReAuth = await confirm({
            message: "You are already logged in. Do you want to re-authenticate?",
            initialValue: false,
        })
        if (isCancel(shouldReAuth) || !shouldReAuth) {
            cancel("Login Cancelled");
            process.exit(0);
        }
    }
    // Create the auth client
    const authClient = createAuthClient({
        baseURL: serverUrl,
        plugins: [deviceAuthorizationClient()],
    })
    const spinner = yoctoSpinner({ text: "Requesting device authorization..." });
    spinner.start();

    try {

        // Request device code
        const { data, error } = await authClient.device.code({
            client_id: clientId,
            scope: "openid profile email",

        })
        spinner.stop();

        if (error || !data) {
            logger.error(
                `Failed to request device authorization: ${error?.error_description || error?.message || "Unknown error"
                }`
            );

            if (error?.status === 404) {
                console.log(chalk.red("\n❌ Device authorization endpoint not found."));
                console.log(chalk.yellow("   Make sure your auth server is running."));
            } else if (error?.status === 400) {
                console.log(
                    chalk.red("\n❌ Bad request - check your CLIENT_ID configuration.")
                );
            }

            process.exit(1);
        }
        const {
            device_code,
            user_code,
            verification_uri,
            verification_uri_complete,
            interval = 5,
            expires_in,
        } = data;


        // Display authorization instructions

        console.log("");
        console.log(chalk.cyan("📱 Device Authorization Required"));
        console.log("");
        console.log(
            `Please visit: ${chalk.underline.blue(
                verification_uri_complete || verification_uri
            )}`
        );
        console.log(`Enter code: ${chalk.bold.green(user_code)}`);
        console.log("");

        const shouldOpen = await confirm({
            message: "Open browser automatically?",
            initialValue: true,
        })

        if (!isCancel(shouldOpen) && shouldOpen) {
            const urlToOpen = verification_uri_complete || verification_uri;
            await open(urlToOpen);
        }
        // Start polling
        console.log(
            chalk.gray(
                `Waiting for authorization (expires in ${Math.floor(
                    expires_in / 60
                )} minutes)...`
            )
        );

        const token = await pollForToken(
            authClient,
            device_code,
            clientId,
            interval
        );
        if (token) {
            // Store the token
            const saved = await storeToken(token);

            if (!saved) {
                console.log(
                    chalk.yellow("\n⚠️  Warning: Could not save authentication token.")
                );
                console.log(
                    chalk.yellow("   You may need to login again on next use.")
                );
            }
            // Get user info
            const { data: session } = await authClient.getSession({
                fetchOptions: {
                    headers: {
                        Authorization: `Bearer ${token.access_token}`,
                    },
                },
            });
            outro(
                chalk.green(
                    `✅ Login successful! Welcome ${session?.user?.name || session?.user?.email || "User"
                    }`
                )
            );

            console.log(chalk.gray(`\n📁 Token saved to: ${TOKEN_FILE}`));
            console.log(
                chalk.gray("   You can now use AI commands without logging in again.\n")
            );
        }
    } catch (error) {
        spinner.stop();
        console.error(chalk.red("\nLogin failed:"), error.message);
        process.exit(1);

    }
}

// ============================================
// COMMANDER SETUP
// ============================================

export const login = new Command("login")
    .description("Login to Better Auth")
    .option("--server-url <url>", "The Better Auth server URL", URL)
    .option("--client-id <id>", "The OAuth client ID", CLIENT_ID)
    .action(loginAction);