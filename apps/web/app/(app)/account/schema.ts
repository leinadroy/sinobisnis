import { z } from "zod";

export const passwordSchema = z
  .object({
    current: z.string().min(1, "Password lama wajib diisi."),
    password: z.string().min(6, "Password baru minimal 6 karakter."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Konfirmasi password tidak sama." });

export type PasswordValues = z.infer<typeof passwordSchema>;
