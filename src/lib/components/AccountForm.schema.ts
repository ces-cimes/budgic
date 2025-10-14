import { z } from 'zod';

export const formSchema = z.object({
  accountName: z.string().min(1, 'Account name is required').max(50, 'Account name must be less than 50 characters'),
  accountType: z.enum(['checking', 'savings', 'credit', 'cash', 'investment', 'crypto'], {
    required_error: 'Please select an account type'
  }),
  initialBalance: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && isFinite(num);
  }, 'Please enter a valid number'),
  currency: z.string().min(1, 'Please select a currency')
});

export type FormSchema = typeof formSchema; 