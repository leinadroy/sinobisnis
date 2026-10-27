import { z } from "zod";

const base = {
  fullname: z.string().trim().min(1, "Fullname wajib diisi."),
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,50}$/, "Username 3–50 karakter: huruf, angka, titik, _ atau -."),
  email: z.union([z.literal(""), z.email("Format email tidak valid.")]),
  roleId: z.string().min(1, "Role wajib dipilih."),
  isActive: z.boolean(),
  password: z.string(),
  retypePassword: z.string(),
};

const samePassword = (v: { password: string; retypePassword: string }) => v.password === v.retypePassword;

/** Saat membuat user, password wajib; saat ubah, kosong = tidak diganti. */
export const userSchema = (isNew: boolean) =>
  z
    .object(base)
    .refine((v) => (isNew ? v.password.length >= 6 : v.password === "" || v.password.length >= 6), {
      path: ["password"], message: "Password minimal 6 karakter.",
    })
    .refine(samePassword, { path: ["retypePassword"], message: "Retype password tidak sama." });

export type UserValues = z.infer<ReturnType<typeof userSchema>>;
