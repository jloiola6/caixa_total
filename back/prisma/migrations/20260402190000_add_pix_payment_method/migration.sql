-- Add PIX payment method to enum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'pix';
