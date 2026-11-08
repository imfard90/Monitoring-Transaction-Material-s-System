import { z } from 'zod';

export const nteTagFormSchema = z.object({
    asal: z.string().min(1, 'Asal wajib dipilih'),
    tujuan: z.string().min(1, 'Tujuan wajib dipilih'),
});

export type NteTagFormValues = z.infer<typeof nteTagFormSchema>;
