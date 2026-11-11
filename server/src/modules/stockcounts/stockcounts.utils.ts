import { Prisma } from "@prisma/client";

/**
 * Computes the variance between the physical counted quantity and the
 * expected ledger balance using Prisma Decimal arithmetic so authoritative
 * stock numbers never pass through JavaScript floating-point math.
 *
 *   Variance = Physical Quantity - Expected Ledger Balance
 *
 * A positive variance means physical stock exceeds the ledger (surplus);
 * a negative variance means stock is missing (shortage).
 */
export function computeVariance(
  countedQuantity: Prisma.Decimal | number | string,
  expectedQuantity: Prisma.Decimal | number | string,
): Prisma.Decimal {
  return new Prisma.Decimal(countedQuantity.toString()).minus(
    new Prisma.Decimal(expectedQuantity.toString()),
  );
}

/**
 * Converts a ledger balance (which Phase A rounds to 4 decimal places as a
 * JS number) into an exact 4-decimal Decimal for persistence. Passing through
 * the string representation preserves the already-rounded 4-decimal value.
 */
export function toQuantityDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(4));
}

export function isZeroQuantity(value: Prisma.Decimal): boolean {
  return value.isZero();
}
