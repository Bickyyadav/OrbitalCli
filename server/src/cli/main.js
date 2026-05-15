#!/usr/bin/env node

import dotenv from "dotenv";

import chalk from "chalk";
import figlet from "figlet";

import { Command } from "commander";
import { login, logout, whoami } from "./commands/auth/login.js";
import { wakeup } from "./commands/ai/wakeup.js";

// import { login, logout, whoami } from "./commands/auth/login.js";
// import { wakeUp } from "./commands/ai/wakeUp.js";


dotenv.config();

async function main() {
    // Display banner
    console.log(
        chalk.cyan(
            figlet.textSync("Orbit CLI", {
                font: "Standard",
                horizontalLayout: "default",
            })
        )
    );

    console.log(chalk.gray("A Cli based AI tool \n"));
    const program = new Command();
    program.name("orbit").version("1.0.0").description("A Cli based AI tool")
        .addCommand(login)
        .addCommand(logout)
        .addCommand(whoami)
        .addCommand(wakeup)



    program.showHelpAfterError();

    program.parse(process.argv);

    // Show help if no arguments were provided
    if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

main().catch((error) => {
    console.error(chalk.red("Error running Orbit CLI:"), error);
    process.exit(1);
});

