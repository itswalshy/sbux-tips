import { BillInventory } from "@shared/schema";
import { roundToNearestDollar } from "./utils";

const DENOMINATION_DETAILS = [
  { value: 20, key: "twenties" as const },
  { value: 10, key: "tens" as const },
  { value: 5, key: "fives" as const },
  { value: 1, key: "ones" as const },
];

export const DENOMINATIONS = DENOMINATION_DETAILS.map((detail) => detail.value) as ReadonlyArray<number>;

type BillCountsArray = [number, number, number, number];

const emptyCounts = (): BillCountsArray => [0, 0, 0, 0];

const inventoryToCounts = (inventory: BillInventory): BillCountsArray => [
  inventory.twenties ?? 0,
  inventory.tens ?? 0,
  inventory.fives ?? 0,
  inventory.ones ?? 0,
];

const countsToInventory = (counts: BillCountsArray): BillInventory => ({
  twenties: counts[0],
  tens: counts[1],
  fives: counts[2],
  ones: counts[3],
});

const countsToBreakdown = (counts: BillCountsArray) =>
  DENOMINATION_DETAILS
    .map((detail, index) => ({
      denomination: detail.value,
      quantity: counts[index],
    }))
    .filter((entry) => entry.quantity > 0);

const countsFitInventory = (counts: BillCountsArray, inventory: BillCountsArray) =>
  counts.every((count, index) => count <= inventory[index]);

const subtractCounts = (inventory: BillCountsArray, counts: BillCountsArray): BillCountsArray =>
  inventory.map((value, index) => value - counts[index]) as BillCountsArray;

const generateCombos = (amount: number, inventory: BillCountsArray): BillCountsArray[] => {
  const combos: BillCountsArray[] = [];

  const maxTwenties = Math.min(Math.floor(amount / 20), inventory[0]);
  for (let twenties = maxTwenties; twenties >= 0; twenties--) {
    const afterTwenties = amount - twenties * 20;
    const maxTens = Math.min(Math.floor(afterTwenties / 10), inventory[1]);
    for (let tens = maxTens; tens >= 0; tens--) {
      const afterTens = afterTwenties - tens * 10;
      const maxFives = Math.min(Math.floor(afterTens / 5), inventory[2]);
      for (let fives = maxFives; fives >= 0; fives--) {
        const afterFives = afterTens - fives * 5;
        if (afterFives <= inventory[3]) {
          combos.push([twenties, tens, fives, afterFives]);
        }
      }
    }
  }

  combos.sort((a, b) => {
    if (a[3] !== b[3]) return a[3] - b[3]; // prefer fewer $1 bills
    if (a[2] !== b[2]) return a[2] - b[2]; // then fewer $5 bills
    if (a[1] !== b[1]) return a[1] - b[1]; // then fewer $10 bills
    return a[0] - b[0]; // finally fewer $20 bills
  });

  return combos;
};

const searchAllocation = (
  partners: Array<{ index: number; rounded: number; combos: BillCountsArray[] }>,
  position: number,
  remaining: BillCountsArray,
  allocation: BillCountsArray[]
): BillCountsArray | null => {
  if (position >= partners.length) {
    return remaining;
  }

  const partner = partners[position];

  for (const combo of partner.combos) {
    if (!countsFitInventory(combo, remaining)) {
      continue;
    }

    allocation[partner.index] = [...combo] as BillCountsArray;
    const result = searchAllocation(partners, position + 1, subtractCounts(remaining, combo), allocation);
    if (result) {
      return result;
    }
    allocation[partner.index] = emptyCounts();
  }

  return null;
};

export const calculateInventoryTotal = (inventory: BillInventory): number =>
  (inventory.twenties ?? 0) * 20 +
  (inventory.tens ?? 0) * 10 +
  (inventory.fives ?? 0) * 5 +
  (inventory.ones ?? 0);

export function allocateBillBreakdowns(
  roundedAmounts: number[],
  billInventory: BillInventory
): { breakdowns: Array<Array<{ denomination: number; quantity: number }>>; remaining: BillInventory } | null {
  const availableCounts = inventoryToCounts(billInventory);

  const partners = roundedAmounts.map((rounded, index) => ({
    index,
    rounded,
    combos: generateCombos(rounded, availableCounts),
  }));

  // If any partner cannot be represented with available bills, fail early
  if (partners.some((partner) => partner.combos.length === 0)) {
    return null;
  }

  partners.sort((a, b) => b.rounded - a.rounded);

  const allocation: BillCountsArray[] = new Array(roundedAmounts.length).fill(null).map(() => emptyCounts());
  const remaining = searchAllocation(partners, 0, availableCounts, allocation);

  if (!remaining) {
    return null;
  }

  const breakdowns = allocation.map((counts) => countsToBreakdown(counts));

  return {
    breakdowns,
    remaining: countsToInventory(remaining),
  };
}

/**
 * Calculates the optimal bill breakdown for a given amount
 * @param amount The amount to break down into bills
 * @returns Array of {denomination, quantity} objects
 */
export function calculateBillBreakdown(amount: number): Array<{denomination: number, quantity: number}> {
  // First, round to the nearest dollar
  const roundedAmount = roundToNearestDollar(amount);
  
  let remaining = roundedAmount;
  const breakdown: Array<{denomination: number, quantity: number}> = [];
  
  // Calculate how many of each denomination are needed
  for (const { value: denom } of DENOMINATION_DETAILS) {
    if (remaining >= denom) {
      const quantity = Math.floor(remaining / denom);
      breakdown.push({
        denomination: denom,
        quantity
      });
      remaining -= denom * quantity;
    }
  }
  
  return breakdown;
}

/**
 * Rounds a payout to the nearest dollar and calculates bill breakdown
 * @param payout The exact payout amount
 * @returns Object with rounded amount and bill breakdown
 */
export function roundAndCalculateBills(payout: number): {
  rounded: number;
  billBreakdown: Array<{denomination: number, quantity: number}>;
} {
  const rounded = roundToNearestDollar(payout);
  const billBreakdown = calculateBillBreakdown(rounded);
  
  return {
    rounded,
    billBreakdown
  };
}
