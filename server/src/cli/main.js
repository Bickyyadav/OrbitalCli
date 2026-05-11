#!/usr/bin/env node

import dotenv from "dotenv";

import chalk from "chalk";
import figlet from "figlet";

import { Command } from "commander";
import { login } from "./commands/auth/login.js";

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



    // Default action shows help
    program.action(() => {
        program.help();
    });

    program.parse();
}

main().catch((error) => {
    console.error(chalk.red("Error running Orbit CLI:"), error);
    process.exit(1);
});

