import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";

dotenv.config();

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}))

app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json())

app.get("/health", (req, res) => {
    res.json({ message: "ok" })
})

app.use("/device", async (req, res) => {
    const { user_code } = req.query
    res.redirect(`${process.env.CLIENT_URL}/device?user_code=${user_code}`)
})



app.listen(process.env.PORT || 5001, () => {
    console.log(`Server is running on port ${process.env.PORT || 5001}`)
})



