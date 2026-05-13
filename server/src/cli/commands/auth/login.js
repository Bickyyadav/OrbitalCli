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
const CONFIG_DIR = path.join(os.homedir(), ".better-auth")
const TOKEN_FILE = path.join(CONFIG_DIR, "token.json")


// ============================================
// TOKEN MANAGEMENT (Export these for use in other commands)
// ============================================

export async function getStoredToken() {
    try {
        const data = await fs.readFile(TOKEN_FILE, "utf-8");
        const token = JSON.parse(data);
        return token;

    } catch (error) {
        // File doesn't exist or can't be read
        return null;
    }
}

export async function storeToken(token) {
    try {
        // Ensure config directory exists
        await fs.mkdir(CONFIG_DIR, { recursive: true });
        // Store token with metadata
        const tokenData = {
            access_token: token.access_token,
            refresh_token: token.refresh_token, // Store if available
            token_type: token.token_type || "Bearer",
            scope: token.scope,
            expires_at: token.expires_in
                ? new Date(Date.now() + token.expires_in * 1000).toISOString()
                : null,
            created_at: new Date().toISOString(),
        };

        await fs.writeFile(TOKEN_FILE, JSON.stringify(tokenData, null, 2), "utf-8");
        return true;
    } catch (error) {
        console.error(chalk.red("Failed to store token:"), error.message);
        return false;
    }
}

export async function clearStoredToken() {
    try {
        await fs.unlink(TOKEN_FILE);
        return true;
    } catch (error) {
        // File doesn't exist or can't be deleted
        return false;
    }
}


export async function isTokenExpired() {
    const token = await getStoredToken();
    if (!token || !token.expires_at) {
        return true;
    }

    const expiresAt = new Date(token.expires_at);
    const now = new Date();

    // Consider expired if less than 5 minutes remaining
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}

export async function requireAuth() {
    const token = await getStoredToken();
    if (!token) {
        console.log(
            chalk.red("❌ Not authenticated. Please run 'your-cli login' first.")
        );
        process.exit(1);
    }

    if (await isTokenExpired()) {
        console.log(
            chalk.yellow("⚠️  Your session has expired. Please login again.")
        );
        console.log(chalk.gray("   Run: your-cli login\n"));
        process.exit(1);
    }
    return token;
}



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


async function pollForToken(authClient, deviceCode, clientId, initialInterval) {
    let pollingInterval = initialInterval;
    const spinner = yoctoSpinner({ text: "", color: "cyan" });
    let dots = 0;

    return new Promise((resolve, reject) => {
        const poll = async () => {
            dots = (dots + 1) % 4;
            spinner.text = chalk.gray(
                `Polling for authorization${".".repeat(dots)}${" ".repeat(3 - dots)}`
            );
            if (!spinner.isSpinning) spinner.start();

            try {
                const { data, error } = await authClient.device.token({
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                    device_code: deviceCode,
                    client_id: clientId,
                    fetchOptions: {
                        headers: {
                            "user-agent": `Better Auth CLI`,
                        },
                    },
                });

                
                if (data?.access_token) {
                    console.log(
                        chalk.bold.yellow(`Your access token: ${data.access_token}`)
                    );
                    spinner.stop();
                    resolve(data);
                    return;
                } else if (error) {
                    switch (error.error) {
                        case "authorization_pending":
                            // Continue polling
                            break;
                        case "slow_down":
                            pollingInterval += 5;
                            break;
                        case "access_denied":
                            spinner.stop();
                            logger.error("Access was denied by the user");
                            process.exit(1);
                            break;
                        case "expired_token":
                            spinner.stop();
                            logger.error("The device code has expired. Please try again.");
                            process.exit(1);
                            break;
                        default:
                            spinner.stop();
                            logger.error(`Error: ${error.error_description}`);
                            process.exit(1);
                    }
                }
            } catch (error) {
                spinner.stop();
                logger.error(`Network error: ${error.message}`);
                process.exit(1);

            }
            setTimeout(poll, pollingInterval * 1000);
        }
        setTimeout(poll, pollingInterval * 1000);
    })
}


// ============================================
// COMMANDER SETUP
// ============================================

export const login = new Command("login")
    .description("Login to Better Auth")
    .option("--server-url <url>", "The Better Auth server URL", URL)
    .option("--client-id <id>", "The OAuth client ID", CLIENT_ID)
    .action(loginAction);