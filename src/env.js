import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        DATABASE_URL: z.string().url(),
        NODE_ENV: z
            .enum(["development", "test", "production"])
            .default("development"),
        
        // Swapped Anthropic validation out for Gemini
        GEMINI_API_KEY: z.string().min(1),

        PUSHER_APP_ID: z.string().min(1),
        PUSHER_KEY: z.string().min(1),
        PUSHER_SECRET: z.string().min(1),
        PUSHER_CLUSTER: z.string().min(1),
    },

    client: {
        NEXT_PUBLIC_PUSHER_KEY: z.string().min(1),
        NEXT_PUBLIC_PUSHER_CLUSTER: z.string().min(1),
    },

    runtimeEnv: {
        DATABASE_URL: process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV,
        
        // Swapped mapping here
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        
        PUSHER_APP_ID: process.env.PUSHER_APP_ID,
        PUSHER_KEY: process.env.PUSHER_KEY,
        PUSHER_SECRET: process.env.PUSHER_SECRET,
        PUSHER_CLUSTER: process.env.PUSHER_CLUSTER,

        NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
        NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    },
    
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});